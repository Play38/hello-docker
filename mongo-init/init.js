db = db.getSiblingDB('mydb');
db.createUser({
  user: 'appuser',
  pwd: 'apppass',
  roles: [{ role: 'readWrite', db: 'mydb' }]
});