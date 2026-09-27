import db from './db-sqlite';
db.prepare("UPDATE sessions SET status = 'CANCELLED' WHERE status = 'ACTIVE'").run();
console.log('Reset complete');
