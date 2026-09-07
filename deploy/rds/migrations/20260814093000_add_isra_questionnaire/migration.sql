ALTER TABLE "IsraAssessment" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'Workbook';
ALTER TABLE "IsraAssessment" ADD COLUMN "respondentName" TEXT;
ALTER TABLE "IsraAssessment" ADD COLUMN "questionnaireResponses" TEXT;
