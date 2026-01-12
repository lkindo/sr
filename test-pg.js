/* eslint-disable no-console */
const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/sr_db?schema=public',
});

async function main() {
    try {
        await client.connect();
        console.log('PG Connected!');
        const res = await client.query('SELECT $1::text as message', ['Hello world!']);
        console.log(res.rows[0].message);
        await client.end();
    } catch (e) {
        console.error('PG Failed:', e);
    }
}

main();
