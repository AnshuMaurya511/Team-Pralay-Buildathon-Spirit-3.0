CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "FraudCase" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "incidentDate" TIMESTAMP(3),
  "mode" TEXT,
  "platform" TEXT,
  "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "priority" TEXT NOT NULL DEFAULT 'High',
  "status" TEXT NOT NULL DEFAULT 'In Progress',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "FraudCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FraudCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FraudCase_reference_key" ON "FraudCase"("reference");
CREATE INDEX "FraudCase_userId_updatedAt_idx" ON "FraudCase"("userId", "updatedAt");

CREATE TABLE "Evidence" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageProvider" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Evidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "FraudCase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Evidence_caseId_createdAt_idx" ON "Evidence"("caseId", "createdAt");

CREATE TABLE "TimelineEvent" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimelineEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "FraudCase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TimelineEvent_caseId_eventAt_idx" ON "TimelineEvent"("caseId", "eventAt");

CREATE TABLE "Task" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'Pending',
  "priority" TEXT NOT NULL DEFAULT 'Medium',
  "userId" TEXT NOT NULL,
  "caseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Task_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "FraudCase"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Task_userId_dueDate_idx" ON "Task"("userId", "dueDate");

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Open',
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
