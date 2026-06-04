const prisma = require("../config/prisma");

async function main() {
    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
        },
        take: 10,
    });

    console.log("Users found:", users.length);
    console.table(users);
}

main()
    .catch((error) => {
        console.error("PostgreSQL test failed:");
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });