#!/usr/bin/env node

/**
 * Генератор тестовых данных для AccessWeb
 * Создаёт JSON файл с примерами записей для всех трёх таблиц
 */

const fs = require('fs');

// Функция для генерации случайных дат
function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString().split('T')[0];
}

// Генерируем ACID записи
function generateAcidRecords(count = 10) {
    const acidRecords = [];
    const suppliers = ['Supplier A', 'Supplier B', 'Supplier C', 'Supplier D'];
    const statuses = ['New', 'In Transit', 'Customs', 'Delivered', 'Problem'];
    const countries = ['China', 'Italy', 'Turkey', 'Russia'];
    const types = ['Sea', 'Air', 'Rail'];
    const shippingLines = ['Maersk', 'MSC', 'COSCO', 'Evergreen'];
    
    for (let i = 1; i <= count; i++) {
        acidRecords.push({
            ACID: `ACID-${String(i).padStart(4, '0')}`,
            Грузоотправитель: `Company ${String(i % 5).padStart(2, '0')}`,
            Статус: statuses[Math.floor(Math.random() * statuses.length)],
            Поставщик: suppliers[Math.floor(Math.random() * suppliers.length)],
            Наименование: ['Электроника', 'Текстиль', 'Оборудование', 'Сырьё'][Math.floor(Math.random() * 4)],
            'GW кг': String(Math.floor(500 + Math.random() * 5000)),
            'Номер КТИ': `KTI-2026-${String(i).padStart(4, '0')}`,
            'Стоимость Груза': String(Math.floor(10000 + Math.random() * 100000)),
            Валюта: ['USD', 'EUR', 'EGP'][Math.floor(Math.random() * 3)],
            'Количество мест': String(10 + Math.floor(Math.random() * 50)),
            'Тип перевозки': types[Math.floor(Math.random() * types.length)],
            'Количество контейнеров': String(1 + Math.floor(Math.random() * 5)),
            'Страна отправления': countries[Math.floor(Math.random() * countries.length)],
            ETD: randomDate(new Date('2026-01-01'), new Date('2026-04-30')),
            ETA: randomDate(new Date('2026-04-01'), new Date('2026-06-30')),
            'Место прибытия': 'Egypt',
            Incoterms: ['FOB', 'CIF', 'DDP'][Math.floor(Math.random() * 3)],
            'Место поставки': 'Cairo',
            'Порт отправления': 'Shanghai',
            Судно: `MV ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 1000)}`,
            'Shiping Line': shippingLines[Math.floor(Math.random() * shippingLines.length)],
            'BoL Number': `BOL-${Math.floor(100000 + Math.random() * 900000)}`,
            'BoL Date': randomDate(new Date('2026-01-01'), new Date('2026-04-30')),
            'Дата запроса освобождения': randomDate(new Date('2026-03-01'), new Date('2026-05-30')),
            'Куратор освобождения': ['Ahmed', 'Karim', 'Hassan'][Math.floor(Math.random() * 3)],
            'Дата получения освобождения': randomDate(new Date('2026-03-15'), new Date('2026-05-31')),
            'Дата прибытия в Египет': randomDate(new Date('2026-04-01'), new Date('2026-06-01')),
            DO: `DO-${String(100 + i).padStart(4, '0')}`,
            Режим: 'Import',
            '№ ДТ': `DT-${String(i).padStart(4, '0')}`,
            'Дата ДТ': randomDate(new Date('2026-04-15'), new Date('2026-06-01')),
            'Дата выпуска ДТ': randomDate(new Date('2026-04-16'), new Date('2026-06-02')),
            'Дата поставки на площадку': randomDate(new Date('2026-04-20'), new Date('2026-06-05')),
            Назначение: ['Retail', 'Wholesale', 'Manufacturing'][Math.floor(Math.random() * 3)],
            Ответственный: ['Mohsen', 'Fatima', 'Ali'][Math.floor(Math.random() * 3)],
            'Куратор УПО': ['Layla', 'Noor', 'Sara'][Math.floor(Math.random() * 3)],
            Контракт: `CONTRACT-${String(Math.floor(Math.random() * 50) + 1).padStart(3, '0')}`,
            Примечание: Math.random() > 0.7 ? 'Urgent' : 'Standard',
            'Инвойс загружен': Math.random() > 0.3 ? 'Yes' : 'No',
            Перевозчик: 'Transport Co'
        });
    }
    return acidRecords;
}

// Генерируем Договоры
function generateContractRecords(count = 15) {
    const contracts = [];
    const statuses = ['Active', 'Pending', 'Completed', 'On Hold'];
    const characters = ['Regular', 'Urgent', 'Framework'];
    const types = ['Supply', 'Service', 'Lease'];
    
    for (let i = 1; i <= count; i++) {
        const startDate = new Date('2026-01-01');
        const endDate = new Date(startDate.getTime() + Math.random() * 365 * 24 * 60 * 60 * 1000);
        
        contracts.push({
            Номер: `CONTRACT-${String(i).padStart(3, '0')}`,
            Предмет: ['Услуги логистики', 'Поставка оборудования', 'Аренда склада'][Math.floor(Math.random() * 3)],
            Контрагент: `Partner ${String(Math.floor(Math.random() * 20) + 1).padStart(2, '0')}`,
            Тип: types[Math.floor(Math.random() * types.length)],
            'Характер закупки': characters[Math.floor(Math.random() * characters.length)],
            Особенности: Math.random() > 0.5 ? 'Standard' : 'Special Requirements',
            Дата: randomDate(new Date('2026-01-01'), new Date('2026-03-31')),
            Окончание: endDate.toISOString().split('T')[0],
            Статус: statuses[Math.floor(Math.random() * statuses.length)],
            Протокол: `Protocol-${String(i).padStart(3, '0')}`,
            Лимит: String(Math.floor(50000 + Math.random() * 500000)),
            'Валюта оплаты': ['USD', 'EUR', 'EGP'][Math.floor(Math.random() * 3)],
            'Сумма оплаты': String(Math.floor(10000 + Math.random() * 200000)),
            'Остаток Лимита': String(Math.floor(10000 + Math.random() * 100000)),
            'Валютный контроль': Math.random() > 0.3 ? 'Required' : 'Not Required',
            'ДС Дата': randomDate(new Date('2026-01-15'), new Date('2026-04-15')),
            Ссылка: `https://example.com/contract/${i}`,
            Комментарий: ['Standard terms', 'Need review', 'Approved'][Math.floor(Math.random() * 3)],
            'Стадия договора': ['Draft', 'Negotiation', 'Pending Approval', 'In Progress', 'Completed'][Math.floor(Math.random() * 5)]
        });
    }
    return contracts;
}

// Генерируем Финансовые записи
function generateFinanceRecords(count = 30) {
    const finance = [];
    const states = ['Paid', 'Pending', 'Processing', 'Completed'];
    
    for (let i = 1; i <= count; i++) {
        const ktiNumber = `KTI-2026-${String(Math.floor(Math.random() * 10) + 1).padStart(4, '0')}`;
        const currency = ['EGP', 'EUR', 'RUB', 'USD'][Math.floor(Math.random() * 4)];
        const amount = Math.floor(1000 + Math.random() * 50000);
        
        // Расчёт USD
        const rates = { EGP: 1, EUR: 35, RUB: 0.35, USD: 31 };
        const usdAmount = currency === 'USD' ? amount : (amount / rates[currency]).toFixed(2);
        
        finance.push({
            Дата: randomDate(new Date('2026-04-01'), new Date('2026-04-21')),
            'Номер КТИ': ktiNumber,
            'Дата расхода': randomDate(new Date('2026-03-01'), new Date('2026-04-20')),
            'КТИ/Дата': `${ktiNumber}/${randomDate(new Date('2026-03-01'), new Date('2026-04-20'))}`,
            Валюта: currency,
            Сумма: String(amount),
            'Перевод в USD': String(usdAmount),
            Организация: `Company ${String(Math.floor(Math.random() * 5) + 1).padStart(2, '0')}`,
            Контрагент: `Partner ${String(Math.floor(Math.random() * 20) + 1).padStart(2, '0')}`,
            Договор: `CONTRACT-${String(Math.floor(Math.random() * 50) + 1).padStart(3, '0')}`,
            'Дата договора': randomDate(new Date('2026-01-01'), new Date('2026-03-31')),
            Проект: ['Q1 2026', 'Q2 2026', 'Strategic'][Math.floor(Math.random() * 3)],
            Состояние: states[Math.floor(Math.random() * states.length)],
            Ответственный: ['Ahmed', 'Karim', 'Hassan', 'Mohsen'][Math.floor(Math.random() * 4)],
            'Срочный платеж': Math.random() > 0.7 ? 'Yes' : 'No'
        });
    }
    return finance;
}

// Главная функция
function generateAllData() {
    const data = {
        meta: {
            timestamp: new Date().toISOString(),
            exchangeRates: {
                rates: {
                    EGP: 1,
                    EUR: 35,
                    RUB: 0.35,
                    USD: 31
                },
                month: 'April 2026'
            }
        },
        data: [
            ...generateAcidRecords(20),
            ...generateContractRecords(20),
            ...generateFinanceRecords(50)
        ]
    };

    const filename = 'generated-test-data.json';
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`✅ Generated ${data.data.length} test records in ${filename}`);
}

generateAllData();
