import { PrismaClient } from '@prisma/client';
import { fetchClanMembers, fetchPubgClanById } from '../src/lib/pubg';
import { config } from 'dotenv';

config(); // load .env

const prisma = new PrismaClient();

async function main() {
  const clan = await prisma.clan.findFirst({
    where: { OR: [{ tag: 'SMK' }, { tag: 'D32' }] }
  });
  
  if (!clan) {
    console.log('Clan not found in DB');
    return;
  }
  
  console.log('Found clan in DB:', clan.name, '[', clan.tag, ']', 'pubgClanId:', clan.pubgClanId);
  
  if (!clan.pubgClanId) return;
  
  try {
    console.log('Fetching members via /members endpoint...');
    const members = await fetchClanMembers(clan.pubgClanId, clan.platformShard);
    console.log('Success! Found', members.length, 'members via /members:');
    console.log(members.map(m => m.name).filter(Boolean).join(', '));
  } catch (err: any) {
    console.log('Error with /members:', err.message);
    console.log('Fallback to /clans...');
    const pubgClan = await fetchPubgClanById(clan.pubgClanId, clan.platformShard);
    console.log('Member count:', pubgClan?.memberCount);
    console.log('Member IDs:', pubgClan?.memberIds?.slice(0, 10).join(', ') + '... (truncated)');
    console.log('RAW pubgClan:', JSON.stringify(pubgClan, null, 2));
  }
}

main().finally(() => prisma.$disconnect());
