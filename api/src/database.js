import mysql from "mysql2"

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
}).promise()

async function getUsers() {
    const [rows] = await pool.query("SELECT * FROM credentials")
    return rows
}

async function getUser(id) {
    const [rows] = await pool.query(`
    SELECT * FROM credentials
    WHERE id = ? 
    `, [id])
    return rows[0]
}

async function createUser(username, password) {
    const result = await pool.query(`
    INSERT INTO credentials (username, password)
    VALUES (?, ?)
    `, [username, password])
    return result
}

// const result = await createUser('lol', 'nuts')
// console.log(result)


const user = await getUsers() 
console.log(user) 