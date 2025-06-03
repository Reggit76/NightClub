# NightClub Booking System

Система бронирования для ночного клуба с поддержкой управления мероприятиями, зонами и билетами.

## Требования

- Docker
- Docker Compose

## Запуск проекта

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd nightclub
```

2. Запустите проект с помощью Docker Compose:
```bash
docker-compose up --build
```

Приложение будет доступно по адресу: http://localhost:8000

API документация (Swagger UI): http://localhost:8000/docs

## Доступ к базе данных через pgAdmin

1. Откройте pgAdmin в браузере: http://localhost:5050
2. Войдите, используя следующие учетные данные:
   - Email: admin@admin.com
   - Пароль: admin
3. Добавьте новый сервер в pgAdmin:
   - Имя: NightClub (или любое другое)
   - Host: db
   - Port: 5432
   - Database: nightclub
   - Username: postgres
   - Password: postgres

## Переменные окружения

Проект использует следующие переменные окружения (значения по умолчанию указаны в docker-compose.yml):

- `DB_HOST` - хост базы данных
- `DB_PORT` - порт базы данных
- `DB_NAME` - имя базы данных
- `DB_USER` - пользователь базы данных
- `DB_PASSWORD` - пароль базы данных
- `JWT_SECRET_KEY` - секретный ключ для JWT токенов

## Основные функции

- Управление мероприятиями
- Управление зонами и местами
- Система бронирования билетов
- Аутентификация и авторизация пользователей
- Роли пользователей (администратор, модератор, пользователь)
- Аудит действий пользователей

## Разработка

Для локальной разработки без Docker:

1. Создайте виртуальное окружение:
```bash
python -m venv .venv
source .venv/bin/activate  # для Linux/Mac
# или
.venv\Scripts\activate  # для Windows
```

2. Установите зависимости:
```bash
pip install -r requirements.txt
```

3. Создайте файл .env с необходимыми переменными окружения

4. Запустите приложение:
```bash
uvicorn main:app --reload
```
