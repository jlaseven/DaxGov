import { PrismaClient } from '@prisma/client';
const db=new PrismaClient();
async function main(){await db.applicationSetting.upsert({where:{key:'applicationName'},update:{},create:{key:'applicationName',value:'Cybersecurity Governance Dashboard'}});console.log('Seed complete (workbook unavailable; no source records invented).')}
main().finally(()=>db.$disconnect());
