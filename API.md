# AccessWeb - JavaScript API Документация

## Доступные функции в консоли браузера (F12)

### Работа с данными

#### `loadTableData(tableName)`
Загружает все данные из таблицы.
```javascript
const data = await loadTableData('acid');
console.log(data); // [ {ACID: '...', ...}, ... ]
```

#### `addRecord(tableName, data)`
Добавляет новую запись.
```javascript
await addRecord('acid', {
    ACID: 'ACID-001',
    Грузоотправитель: 'Company A',
    Статус: 'New'
});
```

#### `updateRecord(tableName, id, data)`
Обновляет существующую запись.
```javascript
await updateRecord('acid', 1, {
    Статус: 'In Transit',
    Примечание: 'Updated'
});
```

#### `deleteRecord(tableName, id)`
Удаляет запись по ID.
```javascript
await deleteRecord('acid', 1);
```

#### `clearTable(tableName)`
Удаляет все данные из таблицы.
```javascript
await clearTable('acid');
```

### Поиск и фильтрация

#### `filterTable()`
Применяет текущие фильтры из UI.
```javascript
document.getElementById('searchInput').value = 'Cairo';
filterTable();
```

#### `sortTable(column)`
Сортирует таблицу по столбцу.
```javascript
sortTable('Дата'); // Сортирует по дате
```

### Валюты

#### `convertToUSD(amount, currency, isFinance)`
Конвертирует сумму в USD.
```javascript
const usd = convertToUSD(5000, 'EGP', false);
console.log(usd); // "161.29"

// Для финансовых записей с сохранёнными курсами:
const usd2 = convertToUSD(8500, 'EUR', true);
```

### Связи между таблицами

#### `getRelatedRecords(table, key, value)`
Находит связанные записи в других таблицах.
```javascript
// Найти все финансовые записи и договоры для данного груза
const related = await getRelatedRecords('acid', 'ACID', 'ACID-001');
console.log(related.finance); // [ ... ]
console.log(related.contracts); // [ ... ]
```

### UI операции

#### `renderTable(tableName)`
Перезагружает и отображает таблицу.
```javascript
await renderTable('contracts');
```

#### `openAddModal()`
Открывает диалог для добавления новой записи.
```javascript
openAddModal();
```

#### `editRecord(id)`
Открывает диалог для редактирования записи.
```javascript
editRecord(5);
```

#### `exportToExcel()`
Экспортирует текущую таблицу в CSV.
```javascript
exportToExcel();
```

### Импорт

#### `openImportModal()`
Открывает диалог импорта.
```javascript
openImportModal();
```

#### `parseCSV(text)`
Парсит CSV текст в массив объектов.
```javascript
const csv = `Name,Age\nJohn,30\nJane,25`;
const data = parseCSV(csv);
console.log(data); // [ {Name: 'John', Age: '30'}, ... ]
```

#### `identifyTable(record)`
Определяет, в какую таблицу добавить запись.
```javascript
const table = identifyTable({
    ACID: 'ACID-001',
    Грузоотправитель: 'Company'
});
console.log(table); // 'acid'
```

### Уведомления

#### `showNotification(message, type)`
Показывает уведомление.
```javascript
showNotification('Данные сохранены', 'success');
showNotification('Ошибка!', 'error');
showNotification('Внимание', 'warning');
```

## Таблицы и столбцы

### TABLES объект
```javascript
// Доступ к конфигурации таблиц:
console.log(TABLES.acid.columns);      // Все столбцы ACID
console.log(TABLES.contracts.columns); // Все столбцы Договоров
console.log(TABLES.finance.columns);   // Все столбцы Финансов
```

## Переменные состояния

```javascript
currentTable     // 'acid' | 'contracts' | 'finance'
currentData      // Все записи текущей таблицы
filteredData     // Отфильтрованные записи
db               // IndexedDB объект подключения
exchangeRates    // Курсы валют по умолчанию
importedExchangeRates  // Курсы из последнего импорта
```

## Примеры использования

### Пример 1: Экспортировать все ACID в консоль
```javascript
const acidData = await loadTableData('acid');
console.table(acidData);
```

### Пример 2: Найти грузы со статусом "In Transit"
```javascript
const inTransit = currentData.filter(r => r.Статус === 'In Transit');
console.log(inTransit);
```

### Пример 3: Рассчитать сумму всех договоров в USD
```javascript
const contracts = await loadTableData('contracts');
let totalUSD = 0;
contracts.forEach(c => {
    const amount = parseFloat(c['Сумма оплаты']) || 0;
    const currency = c['Валюта оплаты'];
    totalUSD += parseFloat(convertToUSD(amount, currency, false));
});
console.log('Total USD:', totalUSD);
```

### Пример 4: Импортировать данные программно
```javascript
const data = [
    { ACID: 'ACID-001', Грузоотправитель: 'Company A' },
    { ACID: 'ACID-002', Грузоотправитель: 'Company B' }
];
for (const record of data) {
    await addRecord('acid', record);
}
await renderTable('acid');
```

### Пример 5: Найти просроченные договоры
```javascript
const contracts = await loadTableData('contracts');
const today = new Date();
const overdue = contracts.filter(c => {
    const endDate = new Date(c['Окончание']);
    return endDate < today;
});
console.log('Overdue contracts:', overdue);
```

## IndexedDB Структура

### Хранилища
- `acid` - Таблица ACID
- `contracts` - Таблица Договоры
- `finance` - Таблица Финансы

### Ключ
Каждая запись имеет автоинкрементный `id` (keyPath).

### Пример прямого запроса к IndexedDB
```javascript
// Получить все записи ACID по ID
const tx = db.transaction('acid', 'readonly');
const store = tx.objectStore('acid');
const request = store.getAll();

request.onsuccess = () => {
    console.log(request.result); // Массив всех записей
};
```

## Оптимизация производительности

### Советы для работы с большими наборами данных

```javascript
// Ленивая загрузка (уже реализована):
const ROWS_PER_PAGE = 50;
const startIdx = page * ROWS_PER_PAGE;
const endIdx = startIdx + ROWS_PER_PAGE;
const pageData = filteredData.slice(startIdx, endIdx);

// Индексирование поиска:
const searchIndex = {};
currentData.forEach((row, idx) => {
    const keys = Object.keys(row);
    keys.forEach(key => {
        const value = String(row[key]).toLowerCase();
        if (!searchIndex[value]) searchIndex[value] = [];
        searchIndex[value].push(idx);
    });
});

// Быстрый поиск:
const results = searchIndex['cairo'] || [];
```

## Ошибки и отладка

### Проверка IndexedDB
```javascript
// Убедитесь, что IndexedDB поддерживается
if (!window.indexedDB) {
    alert('IndexedDB не поддерживается');
}

// Смотрите ошибки в консоли (F12)
// Откройте DevTools → Application → IndexedDB
```

### Логирование
```javascript
// Включите подробное логирование в консоли
console.log('Current table:', currentTable);
console.log('Filtered data:', filteredData);
console.log('Current filters:',
    document.getElementById('searchInput').value,
    document.getElementById('filterColumn').value
);
```

## Интеграция с внешними системами

### Экспорт в JSON (для синхронизации)
```javascript
const allData = {
    acid: await loadTableData('acid'),
    contracts: await loadTableData('contracts'),
    finance: await loadTableData('finance'),
    timestamp: new Date().toISOString()
};

const blob = new Blob([JSON.stringify(allData, null, 2)]);
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'accessweb-backup.json';
a.click();
```

### Импорт из внешнего источника
```javascript
fetch('https://api.example.com/data')
    .then(r => r.json())
    .then(async (data) => {
        for (const record of data) {
            const table = identifyTable(record);
            if (table) await addRecord(table, record);
        }
        await renderTable(currentTable);
    });
```

## Лицензия

Открытый API для использования и расширения.

---

**Версия API**: 1.0  
**Дата**: Апрель 2026  
