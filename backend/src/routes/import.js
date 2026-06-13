import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/authenticate.js';
import { AppError } from '../middleware/errorHandler.js';
import { detectAnomalies, parseDate, parseAmount, normalizeName, parseSplitMembers, detectSettlement } from '../lib/csvAnomalyDetector.js';
import { calculateSplits } from '../lib/splitEngine.js';
import { getExchangeRate, convertToInr } from '../lib/currency.js';

const router = express.Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new AppError('Only CSV files allowed', 400));
    }
  },
});

// POST /api/import/upload — Phase 1: Parse + detect anomalies, return for review
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400);

  const { groupId } = req.body;
  if (!groupId) throw new AppError('groupId required', 400);

  // Parse CSV
  let records;
  try {
    records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    });
  } catch (err) {
    throw new AppError(`CSV parse error: ${err.message}`, 400);
  }

  // Run all anomaly detectors
  const allAnomalies = [];
  for (let i = 0; i < records.length; i++) {
    const rowAnomalies = detectAnomalies(records[i], i + 2, records); // +2 = 1-indexed + header
    allAnomalies.push(...rowAnomalies);
  }

  // Create an import session
  const session = await prisma.importSession.create({
    data: {
      groupId: parseInt(groupId),
      filename: req.file.originalname,
      importedBy: req.user.id,
      status: 'pending_review',
      totalRows: records.length,
      rawData: records,
      anomalyCount: allAnomalies.length,
    },
  });

  // Store all anomalies
  if (allAnomalies.length > 0) {
    await prisma.importAnomaly.createMany({
      data: allAnomalies.map(a => ({
        sessionId: session.id,
        rowNumber: a.rowIndex,
        rawData: a.rowData,
        anomalyType: a.type,
        description: a.description,
        severity: a.severity,
        userDecision: 'pending',
        resolvedData: null,
      })),
    });
  }

  // Group anomalies by row for the response
  const anomaliesByRow = {};
  for (const a of allAnomalies) {
    if (!anomaliesByRow[a.rowIndex]) anomaliesByRow[a.rowIndex] = [];
    anomaliesByRow[a.rowIndex].push(a);
  }

  res.status(201).json({
    sessionId: session.id,
    totalRows: records.length,
    anomalyCount: allAnomalies.length,
    anomalies: allAnomalies,
    rows: records.map((r, i) => ({
      rowIndex: i + 2,
      data: r,
      anomalies: anomaliesByRow[i + 2] || [],
    })),
  });
});

// GET /api/import/sessions/:id — get session status + anomalies
router.get('/sessions/:id', async (req, res) => {
  const session = await prisma.importSession.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { anomalies: true },
  });
  if (!session) throw new AppError('Import session not found', 404);
  res.json(session);
});

// PATCH /api/import/sessions/:id/anomalies — update user decisions on anomalies
router.patch('/sessions/:id/anomalies', async (req, res) => {
  const schema = z.object({
    decisions: z.array(z.object({
      anomalyId: z.number(),
      decision: z.enum(['approve', 'reject', 'modify']),
      resolvedData: z.record(z.any()).optional(),
    })),
  });
  const { decisions } = schema.parse(req.body);

  await Promise.all(decisions.map(d =>
    prisma.importAnomaly.update({
      where: { id: d.anomalyId },
      data: {
        userDecision: d.decision,
        resolvedData: d.resolvedData || null,
      },
    })
  ));

  res.json({ updated: decisions.length });
});

// POST /api/import/sessions/:id/commit — Phase 2: Commit approved rows
router.post('/sessions/:id/commit', async (req, res) => {
  const sessionId = parseInt(req.params.id);
  const session = await prisma.importSession.findUnique({
    where: { id: sessionId },
    include: { anomalies: true },
  });
  if (!session) throw new AppError('Session not found', 404);
  if (session.status === 'completed') throw new AppError('Session already committed', 409);

  const records = session.rawData;
  const anomaliesByRow = {};
  for (const a of session.anomalies) {
    if (!anomaliesByRow[a.rowNumber]) anomaliesByRow[a.rowNumber] = [];
    anomaliesByRow[a.rowNumber].push(a);
  }

  // Fetch all users in this group to map names to IDs
  const groupMembers = await prisma.groupMember.findMany({
    where: { groupId: session.groupId },
    include: { user: true },
  });
  const nameToUser = {};
  groupMembers.forEach(m => {
    // Index by full name (lowercase)
    nameToUser[m.user.name.toLowerCase()] = m.user;
    // Also index by first name only (e.g. "Aisha Kapoor" → also keyed as "aisha")
    const firstName = m.user.name.split(' ')[0].toLowerCase();
    if (!nameToUser[firstName]) nameToUser[firstName] = m.user;
  });


  // Build known name list from actual group members (both full name and first name)
  const knownGroupNames = [];
  groupMembers.forEach(m => {
    knownGroupNames.push(m.user.name);                    // "Aisha Kapoor"
    knownGroupNames.push(m.user.name.split(' ')[0]);     // "Aisha"
  });

  const report = {
    imported: [],

    skipped: [],
    settlements: [],
    errors: [],
  };

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowIndex = i + 2;
    const rowAnomalies = anomaliesByRow[rowIndex] || [];

    // Check if any error-level anomaly is unresolved or rejected
    const hasBlockingError = rowAnomalies.some(a =>
      a.severity === 'error' &&
      (a.userDecision === 'pending' || a.userDecision === 'reject')
    );

    if (hasBlockingError) {
      const rejectedAnomaly = rowAnomalies.find(a => a.severity === 'error' && a.userDecision === 'reject');
      if (rejectedAnomaly) {
        report.skipped.push({ rowIndex, reason: 'User rejected: ' + rejectedAnomaly.description });
      } else {
        report.skipped.push({ rowIndex, reason: 'Unresolved error anomaly: ' + rowAnomalies.find(a => a.severity === 'error').description });
      }
      continue;
    }

    // Skip zero-amount rows
    const amount = parseAmount(row.amount);
    if (amount === 0) {
      report.skipped.push({ rowIndex, reason: 'Zero amount expense skipped', description: row.description });
      continue;
    }

    // Check if this row was rejected by the user
    const rowRejected = rowAnomalies.some(a => a.userDecision === 'reject' && a.anomalyType === 'EXACT_DUPLICATE');
    if (rowRejected) {
      report.skipped.push({ rowIndex, reason: 'Rejected as duplicate', description: row.description });
      continue;
    }

    // Check if settlement
    const { isSettlement } = detectSettlement(row);
    const settlementAnomaly = rowAnomalies.find(a => a.anomalyType === 'PROBABLE_SETTLEMENT');
    const isConfirmedSettlement = isSettlement && settlementAnomaly && settlementAnomaly.userDecision !== 'reject';

    if (isConfirmedSettlement) {
      // Record as settlement
      try {
        const payerName = normalizeName(row.paid_by?.trim(), knownGroupNames).canonical;
        const recipientName = row.split_with?.split(';')[0]?.trim();
        const recipientNorm = normalizeName(recipientName, knownGroupNames).canonical;

        const payer = nameToUser[payerName?.toLowerCase()];
        const recipient = nameToUser[recipientNorm?.toLowerCase()];

        if (payer && recipient) {
          const { date } = parseDate(row.date);
          await prisma.settlement.create({
            data: {
              groupId: session.groupId,
              fromUserId: payer.id,
              toUserId: recipient.id,
              amount: Math.abs(amount),
              currency: row.currency || 'INR',
              settledAt: date || new Date(),
              notes: row.notes || row.description,
            },
          });
          report.settlements.push({ rowIndex, description: row.description, from: payerName, to: recipientNorm, amount: Math.abs(amount) });
        } else {
          report.errors.push({ rowIndex, reason: 'Could not resolve settlement parties', row });
        }
      } catch (err) {
        report.errors.push({ rowIndex, reason: err.message, row });
      }
      continue;
    }

    // Import as expense
    try {
      const { date } = parseDate(row.date);
      if (!date) {
        report.errors.push({ rowIndex, reason: 'Could not parse date', row });
        continue;
      }

      // Resolve payer
      const payerNorm = normalizeName(row.paid_by?.trim(), knownGroupNames);
      const modifyAnomaly = rowAnomalies.find(a => a.anomalyType === 'UNKNOWN_MEMBER' && a.userDecision === 'modify');
      const payerName = modifyAnomaly?.resolvedData?.canonical || payerNorm.canonical;
      const payer = nameToUser[payerName?.toLowerCase()];
      if (!payer) {
        report.errors.push({ rowIndex, reason: `Payer "${row.paid_by}" not found in group`, row });
        continue;
      }

      // Currency & amount
      const currency = (row.currency || 'INR').trim() || 'INR';
      let exchangeRate = 1.0;
      let amountInr = Math.abs(amount);
      if (currency !== 'INR') {
        exchangeRate = await getExchangeRate(currency, 'INR', date);
        amountInr = convertToInr(Math.abs(amount), currency, exchangeRate);
      }

      // Split members
      const splitType = row.split_type?.trim() || 'equal';
      const { members: rawMembers } = parseSplitMembers(row.split_with, row.split_details, splitType);

      // Resolve member names to user IDs
      const splitMembers = [];
      for (const m of rawMembers) {
        const norm = normalizeName(m.name, knownGroupNames);
        const user = nameToUser[norm.canonical?.toLowerCase()];
        if (user) {
          splitMembers.push({ userId: user.id, value: m.value || 1 });
        }
        // Skip unknown members (like Dev's friend Kabir) unless user approved adding them
      }

      if (splitMembers.length === 0) {
        report.errors.push({ rowIndex, reason: 'No valid split members found', row });
        continue;
      }

      const splits = calculateSplits(amountInr, splitType === 'unequal' ? 'unequal' : splitType, splitMembers);

      const expense = await prisma.expense.create({
        data: {
          groupId: session.groupId,
          description: row.description,
          paidBy: payer.id,
          amount: Math.abs(amount),
          currency,
          exchangeRate,
          amountInr,
          expenseDate: date,
          splitType,
          isRefund: amount < 0,
          notes: row.notes || null,
          importRow: rowIndex,
          splits: {
            create: splits.map(s => ({ userId: s.userId, shareAmount: s.shareAmount })),
          },
        },
      });

      report.imported.push({ rowIndex, expenseId: expense.id, description: row.description, amountInr });
    } catch (err) {
      report.errors.push({ rowIndex, reason: err.message, row: JSON.stringify(row) });
    }
  }

  // Update session status
  await prisma.importSession.update({
    where: { id: sessionId },
    data: {
      status: 'completed',
      importedCount: report.imported.length,
      skippedCount: report.skipped.length,
      completedAt: new Date(),
    },
  });

  res.json({
    sessionId,
    status: 'completed',
    summary: {
      total: records.length,
      imported: report.imported.length,
      skipped: report.skipped.length,
      settlements: report.settlements.length,
      errors: report.errors.length,
    },
    report,
  });
});

// GET /api/import/sessions/:id/report — download import report
router.get('/sessions/:id/report', async (req, res) => {
  const session = await prisma.importSession.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { anomalies: true, importer: { select: { name: true } } },
  });
  if (!session) throw new AppError('Session not found', 404);

  const report = {
    generated: new Date().toISOString(),
    file: session.filename,
    importedBy: session.importer.name,
    status: session.status,
    summary: {
      totalRows: session.totalRows,
      imported: session.importedCount,
      skipped: session.skippedCount,
      anomalies: session.anomalyCount,
    },
    anomalies: session.anomalies.map(a => ({
      row: a.rowNumber,
      type: a.anomalyType,
      severity: a.severity,
      description: a.description,
      decision: a.userDecision,
      resolvedData: a.resolvedData,
    })),
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="import_report_${session.id}.json"`);
  res.json(report);
});

export default router;
