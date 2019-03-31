const fs = require('fs');
const bodyParser = require('body-parser');
const jsonServer = require('json-server');
const jwt = require('jsonwebtoken');
const jsf = require('json-schema-faker');
const faker = require('faker');
const databaseSchema = require('./schema');

const DATABASE_DEST = './database/database.json';
const SECRET_KEY = '123456789';
const expiresIn = '1h';
let noAuth = false;

process.argv.forEach(arg => {
    if (arg.toLowerCase() === 'noauth') {
        noAuth = true;
    }
});

jsf.extend('faker', () => faker);
const json = JSON.stringify(jsf.generate(databaseSchema));
fs.writeFileSync(DATABASE_DEST, json);

const server = jsonServer.create();
const router = jsonServer.router(DATABASE_DEST);

server.use(bodyParser.urlencoded({extended: true}));
server.use(bodyParser.json());
server.use(jsonServer.defaults());
server.use(jsonServer.rewriter({
    '/api/*': '/$1'
}));

server.post('/login', (req, res) => {
    const {username, password} = req.body;
    const database = JSON.parse(fs.readFileSync(DATABASE_DEST));
    const userIndex = database.users.findIndex(user => user.username === username && user.password === password);

    if (userIndex === -1) {
        const status = 401;
        const message = 'Incorrect username or password';
        res.status(status).json({status, message});
        return
    }

    const userId = database.users[userIndex].id;
    const access_token = jwt.sign({userId, username, password}, SECRET_KEY, {expiresIn});
    res.status(200).json({access_token})
})

server.post('/register', (req, res) => {
    const {username, password} = req.body;

    if (username === undefined || password === undefined) {
        const status = 401;
        const message = 'Missing username or password';
        res.status(status).json({status, message})
    }

    const database = JSON.parse(fs.readFileSync(DATABASE_DEST));
    let users = database.users;
    const nextId = Math.max(...users.map(user => user.id)) + 1;

    users.push({
        id: nextId,
        username: username,
        password: password
    });

    fs.writeFileSync(DATABASE_DEST, JSON.stringify(database));

    res.status(200)
});

server.use(/^(?!(\/register|\/login)).*$/, (req, res, next) => {
    if (req.headers.authorization === undefined || req.headers.authorization.split(' ')[0] !== 'Bearer') {
        const status = 401;
        const message = 'Missing or invalid authorization';
        res.status(status).json({status, message});
        return
    }

    jwt.verify(req.headers.authorization.split(' ')[1], SECRET_KEY, (err, decode) => {
        if (decode === undefined || decode.userId === undefined || decode.username === undefined || decode.password === undefined) {
            const status = 401;
            const message = 'Access token invalid';
            res.status(status).json({status, message});
            return
        }

        if (/students/g.test(req.originalUrl) && !/students\/[0-9]+/g.test(req.originalUrl)) {
            const redirect = req.originalUrl.replace(/students/g, `students/${decode.userId}`);
            res.redirect(307, redirect)
        }

        next()
    })
});

server.use(router);
server.listen(3001, () => {
    console.log('Running mock database on http://localhost:3001')
});