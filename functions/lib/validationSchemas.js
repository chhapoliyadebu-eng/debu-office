"use strict";

const { z } = require("zod");

const draftNotingSchema = z.object({
  letterSubject: z.string().min(1).max(500),
  letterContent: z.string().min(1).max(8000),
  styleSample: z.string().max(4000).optional(),
});

const generateSchema = z.object({
  prompt: z.string().min(1).max(8000),
  context: z.record(z.any()).optional(),
  styleSample: z.string().max(4000).optional(),
});

const mailboxConnectSchema = z.object({
  branchOrSeat: z.string().min(1).max(200),
  officeEmail: z.string().email(),
  imapHost: z.string().min(1).max(200),
  imapPort: z.number().int().positive().max(65535),
  smtpHost: z.string().min(1).max(200),
  smtpPort: z.number().int().positive().max(65535),
  username: z.string().min(1).max(320),
  password: z.string().min(1).max(500),
  connectedBy: z.string().min(1).max(200),
});

const fileMoveSchema = z.object({
  toSeat: z.string().min(1).max(200),
  remarks: z.string().max(2000).optional(),
});

const mailboxSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().max(20000),
});

const updateUserSchema = z.object({
  designation: z.string().trim().min(1).max(200).optional(),
  wing: z.string().trim().min(1).max(200).optional(),
  department: z.string().trim().min(1).max(200).optional(),
  seat: z.string().trim().min(1).max(200).optional(),
  role: z.enum(["USER", "DEPARTMENT_ADMIN", "ADMIN"]).optional(),
});

const shareSchema = z.object({
  targetUid: z.string().min(1),
  permission: z.enum(["VIEW", "COMMENT", "EDIT"]),
});

const rtiSearchSchema = z.object({
  query: z.string().trim().min(1).max(300),
  resultCounts: z.object({
    files: z.number().int().min(0),
    letters: z.number().int().min(0),
    documents: z.number().int().min(0),
    rules: z.number().int().min(0),
    templates: z.number().int().min(0),
  }),
});

module.exports = {
  draftNotingSchema,
  generateSchema,
  mailboxConnectSchema,
  fileMoveSchema,
  mailboxSendSchema,
  updateUserSchema,
  shareSchema,
  rtiSearchSchema,
};
