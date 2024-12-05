const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const simpleGit = require('simple-git');
const path = require('path');

const app = express();
const git = simpleGit();

// Порты
const port = 3000;

// Используем EJS для рендеринга
app.set('views', path.join(__dirname, 'views')); // Убедитесь, что папка views существует
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));

// Путь к JSON данным
const usersFilePath = path.join(__dirname, 'data', 'account.json');
const coursesFilePath = path.join(__dirname, 'data', 'purchase.json');

// Главная страница
app.get('/', (req, res) => {
    res.render('index'); // Ожидается, что файл index.ejs находится в папке views
});

// Страница регистрации
app.get('/register', (req, res) => {
    res.render('register');
});

// Страница аналитики
app.get('/analytics', (req, res) => {
    res.render('analytics');
});

// Регистрация нового пользователя
app.post('/register', (req, res) => {
    const { username, password } = req.body;

    // Чтение данных пользователей
    fs.readFile(usersFilePath, (err, data) => {
        if (err) {
            return res.status(500).send('Ошибка при чтении данных.');
        }

        const users = JSON.parse(data);

        // Проверка, что пользователя с таким username еще нет
        const userExists = users.some(user => user.username === username);

        if (userExists) {
            return res.status(400).send('Пользователь с таким именем уже существует.');
        }

        // Добавление нового пользователя
        const newUser = {
            id: users.length + 1,
            username,
            password
        };

        users.push(newUser);

        // Запись обновленных данных в JSON
        fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), (err) => {
            if (err) {
                return res.status(500).send('Ошибка при записи данных.');
            }
            // Коммит и пуш изменений в Git
            commitAndPush('Добавлен новый пользователь');
            res.send('Пользователь успешно зарегистрирован!');
        });
    });
});

// Выдача курса
app.post('/assign-course', (req, res) => {
    const { username, course } = req.body;

    // Чтение данных пользователей и курсов
    fs.readFile(usersFilePath, (err, data) => {
        if (err) {
            return res.status(500).send('Ошибка при чтении данных пользователей.');
        }

        const users = JSON.parse(data);

        const user = users.find(user => user.username === username);
        if (!user) {
            return res.status(404).send('Пользователь не найден.');
        }

        fs.readFile(coursesFilePath, (err, data) => {
            if (err) {
                return res.status(500).send('Ошибка при чтении данных курсов.');
            }

            const courses = JSON.parse(data);

            // Проверка, что курс еще не был выдан
            if (courses[username] && courses[username].includes(course)) {
                return res.status(400).send('Курс уже выдан этому пользователю.');
            }

            // Добавляем курс пользователю
            if (!courses[username]) {
                courses[username] = [];
            }
            courses[username].push(course);

            // Запись обновленных данных в JSON
            fs.writeFile(coursesFilePath, JSON.stringify(courses, null, 2), (err) => {
                if (err) {
                    return res.status(500).send('Ошибка при записи данных курсов.');
                }
                // Коммит и пуш изменений в Git
                commitAndPush('Выдан курс');
                res.send('Курс успешно выдан пользователю!');
            });
        });
    });
});

// Функция для коммита и пуша на GitHub
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

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер работает на http://localhost:${port}`);
});
