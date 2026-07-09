// Demo/test employee accounts — not part of the real org chart.
// Delete this whole `backend/seed/` folder (or just this file) to stop
// creating them; server.js only seeds these if the file is present.
export default [
  { login: 'ivanov',    password: 'ivanov123',    name: 'Иванов Сергей Петрович',    role: 'logistics_support' },
  { login: 'smirnova',  password: 'smirnova123',  name: 'Смирнова Анна Викторовна',  role: 'info_analytics' },
  { login: 'kuznetsov', password: 'kuznetsov123', name: 'Кузнецов Дмитрий Олегович', role: 'operational_logistics' },
  { login: 'volkova',   password: 'volkova123',   name: 'Волкова Марина Сергеевна',  role: 'logistics_support' },
  { login: 'popov',     password: 'popov123',     name: 'Попов Игорь Николаевич',    role: 'operational_logistics' },
];
