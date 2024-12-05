const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const simpleGit = require('simple-git');
const path = require('path');
require('dotenv').config();
const crypto = require('crypto');

const app = express();
const git = simpleGit();

const port = 3000;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));

const usersFilePath = path.join(__dirname, 'data', 'account.json');
const coursesFilePath = path.join(__dirname, 'data', 'purchase.json');

const rawKey = process.env.ENCRYPTION_KEY; // Длинный ключ из .env
const ENCRYPTION_KEY = crypto.createHash('sha256').update(String(rawKey)).digest('base64').substr(0, 32); // Преобразуем в 32 байта
const IV_LENGTH = parseInt(process.env.IV_LENGTH, 10) || 16; // Длина вектора инициализации

if (!rawKey) {
    console.error('Ошибка: Ключ шифрования (ENCRYPTION_KEY) отсутствует.');
    process.exit(1);
}

// Функция шифрования
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

// Функция расшифровки
function decrypt(text) {
    const [iv, encryptedText] = text.split(':').map(part => Buffer.from(part, 'hex'));
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// Функция для чтения JSON-файла
function readJSONFile(filePath, callback) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(`Ошибка чтения файла ${filePath}:`, err.message);
            callback(err, null);
        } else {
            try {
                const jsonData = JSON.parse(data);
                callback(null, jsonData);
            } catch (parseErr) {
                console.error(`Ошибка парсинга JSON в файле ${filePath}:`, parseErr.message);
                callback(parseErr, null);
            }
        }
    });
}

// Функция для записи JSON-файла
function writeJSONFile(filePath, data, callback) {
    fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
        if (err) {
            console.error(`Ошибка записи файла ${filePath}:`, err.message);
            callback(err);
        } else {
            callback(null);
        }
    });
}

// Функция для коммита и пуша изменений в GitHub
function commitAndPush(commitMessage) {
    git.add('./*')
        .commit(commitMessage)
        .push('origin', 'main', (err) => {
            if (err) {
                console.error('Ошибка при пуше изменений:', err);
            } else {
                console.log('Изменения успешно отправлены на GitHub');
            }
        });
}

// Маршрут главной страницы
app.get('/', (req, res) => {
    res.render('index');
});

// Маршрут страницы регистрации
app.get('/register', (req, res) => {
    res.render('register');
});

// Регистрация нового пользователя
app.post('/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('Имя пользователя и пароль обязательны для заполнения.');
    }

    readJSONFile(usersFilePath, (err, users) => {
        if (err) return res.status(500).send('Ошибка при чтении данных.');

        if (users.some(user => user.username === username)) {
            return res.status(400).send('Пользователь с таким именем уже существует.');
        }

        // Шифрование пароля
        const encryptedPassword = encrypt(password);

        const newUser = {
            id: users.length + 1,
            username,
            password: encryptedPassword // Сохраняем зашифрованный пароль
        };

        users.push(newUser);

        writeJSONFile(usersFilePath, users, (err) => {
            if (err) return res.status(500).send('Ошибка при записи данных.');

            commitAndPush('Добавлен новый пользователь');
            res.send('Пользователь успешно зарегистрирован!');
        });
    });
});

// Маршрут страницы назначения курса
app.get('/assign-course', (req, res) => {
    res.render('assign-course');
});

// Выдача курса пользователю
app.post('/assign-course', (req, res) => {
    const { username, course } = req.body;

    if (!username || !course) {
        return res.status(400).send('Имя пользователя и курс обязательны для заполнения.');
    }

    readJSONFile(usersFilePath, (err, users) => {
        if (err) return res.status(500).send('Ошибка при чтении данных пользователей.');

        const user = users.find(user => user.username === username);
        if (!user) return res.status(404).send('Пользователь не найден.');

        readJSONFile(coursesFilePath, (err, courses) => {
            if (err) return res.status(500).send('Ошибка при чтении данных курсов.');

            if (courses[username]?.includes(course)) {
                return res.status(400).send('Курс уже выдан этому пользователю.');
            }

            if (!courses[username]) courses[username] = [];
            courses[username].push(course);

            writeJSONFile(coursesFilePath, courses, (err) => {
                if (err) return res.status(500).send('Ошибка при записи данных курсов.');

                commitAndPush('Выдан курс');
                res.send('Курс успешно выдан пользователю!');
            });
        });
    });
});

// Маршрут страницы проверки пользователя
app.get('/check-user', (req, res) => {
    res.render('check-user', { user: null, userCourses: [] });
});

// Проверка пользователя
app.post('/check-user', (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).send('Имя пользователя обязательно для проверки.');
    }

    readJSONFile(usersFilePath, (err, users) => {
        if (err) return res.status(500).send('Ошибка при чтении данных пользователей.');

        const user = users.find(u => u.username === username);

        readJSONFile(coursesFilePath, (err, courses) => {
            if (err) return res.status(500).send('Ошибка при чтении данных курсов.');

            let decryptedPassword = null;
            if (user) {
                // Расшифровка пароля
                decryptedPassword = decrypt(user.password);
                user.password = decryptedPassword;
            }

            const userCourses = user ? courses[username] || [] : [];
            res.render('check-user', { user: user || null, userCourses });
        });
    });
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер работает на http://localhost:${port}`);
});
