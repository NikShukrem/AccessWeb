# AccessWeb v3

Система управления логистикой. Ноутбук выступает сервером, фронтенд на GitHub Pages.

## Быстрый старт

### 1. Запустить сервер

```
start.bat
```

Сервер запустится на `http://localhost:8080`

### 2. Открыть доступ из интернета (для Египта)

Скачайте [cloudflared](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe) — один exe-файл.

В новом окне CMD:
```
cloudflared-windows-amd64.exe tunnel --url http://localhost:8080
```

Туннель выдаст URL вида `https://xxxx-xxxx.trycloudflare.com` — это адрес для всех внешних пользователей.

### 3. Аккаунты

| Логин | Пароль | Роль |
|-------|--------|------|
| admin | admin123 | Полный доступ |
| egypt | egypt2024 | ACID (только чтение) |

**После первого входа смените пароль!**

## Доступ

- **Офис**: `http://localhost:8080` или `http://[IP-ноута]:8080`
- **Египет / удалённо**: URL туннеля cloudflare
- **GitHub Pages**: `https://nikshukrem.github.io/AccessWeb/` (статичный фронтенд)

## Структура

```
AccessWeb/
├── index.html       # Приложение
├── sw.js            # Service Worker
├── start.bat        # Запуск сервера
└── backend/
    ├── src/server.js
    ├── data/        # База данных SQLite
    └── package.json
```
