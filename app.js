const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const simpleGit = require('simple-git');
const path = require('path');
require('dotenv').config();


const app = express();
const git = simpleGit();

const port = 3000;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));

const usersFilePath = path.join(__dirname, 'data', 'account.json');
const coursesFilePath = path.join(__dirname, 'data', 'purchase.json');
// Получаем ключ шифрования из .env
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Например, 84578268387546481237648362847623875623
const IV_LENGTH = parseInt(process.env.IV_LENGTH, 10) || 16; // Для совместимости с текущим кодом
// Преобразование строки в hex
function stringToHex(str) {
    return Array.from(str)
        .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');
}

const courseDescriptions = {
    "Основы HTML": "Этот курс познакомит вас с основами веб-разработки, включая работу с HTML.",
    "Основы Git": "Курс по основам системы контроля версий Git.",
    "Основы работы с компьютером": "Этот курс поможет вам освоить базовые навыки работы с ПК.",
    "Junior Python Developer": "Курс для начинающих разработчиков на Python.",
    "Junior Frontend Developer": "Основы фронтенд-разработки для начинающих.",
    "Middle Frontend Developer": "Курс для разработчиков с опытом, углубление знаний в фронтенд-технологиях.",
    "Накрутка опыта работы": "Курс по развитию карьерных навыков и достижений."
};



// Преобразование hex в строку
function hexToString(hex) {
    let result = '';
    for (let i = 0; i < hex.length; i += 2) {
        result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return result;
}

// Функция шифрования
function encrypt(text) {
    const key = ENCRYPTION_KEY.slice(0, IV_LENGTH); // Берем первые IV_LENGTH символов ключа
    let encrypted = '';
    for (let i = 0; i < text.length; i++) {
        encrypted += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return stringToHex(encrypted); // Преобразуем зашифрованную строку в hex
}

async function decrypt(encryptedHex) {
    const key = ENCRYPTION_KEY.slice(0, IV_LENGTH); // Берем те же IV_LENGTH символов ключа
    const encrypted = hexToString(encryptedHex); // Преобразуем hex в строку
    let decrypted = '';
    for (let i = 0; i < encrypted.length; i++) {
        decrypted += String.fromCharCode(encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decrypted;
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
    const { username, course, price } = req.body; // Извлекаем цену из тела запроса

    // Проверка обязательных полей
    if (!username || !course) {
        return res.status(400).send('Имя пользователя и курс обязательны для заполнения.');
    }

    readJSONFile(usersFilePath, (err, users) => {
        if (err) return res.status(500).send('Ошибка при чтении данных пользователей.');

        const user = users.find(user => user.username === username);
        if (!user) return res.status(404).send('Пользователь не найден.');

        readJSONFile(coursesFilePath, (err, courses) => {
            if (err) return res.status(500).send('Ошибка при чтении данных курсов.');

            // Проверяем, что курс не был выдан ранее
            if (courses[username]?.some(entry => entry.course === course)) {
                return res.status(400).send('Курс уже выдан этому пользователю.');
            }

            // Инициализируем массив курсов для пользователя, если его ещё нет
            if (!courses[username]) courses[username] = [];
            // Добавляем курс с описанием, прогрессом и ценой
            courses[username].push({
                course: course,
                description: courseDescriptions[course] || "Описание отсутствует",
                price: price || "Цена не указана",
                progress: 0 // Начальный прогресс
            });

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
