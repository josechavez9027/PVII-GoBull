import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');
  
  const users = [
    { email: 'user1@example.com', name: 'User One', password: 'password123' },
    { email: 'user2@example.com', name: 'User Two', password: 'password123' },
    { email: 'user3@example.com', name: 'User Three', password: 'password123' }
  ];

  for (const u of users) {
    const hashedPassword = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        password: hashedPassword,
      },
    });
    console.log(`Created user with id: ${user.id}`);
  }
  
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
