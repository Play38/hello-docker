import React, { useState, useEffect } from 'react';

function App() {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');

  // Fetch all items on load
  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = () => {
    fetch('/api/items')
      .then(res => res.json())
      .then(data => setItems(data));
  };

  // Create
  const createItem = () => {
    fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newItem })
    }).then(() => { setNewItem(''); fetchItems(); });
  };

  // Update
  const updateItem = (id) => {
    fetch('/api/items/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName })
    }).then(() => { setEditId(null); fetchItems(); });
  };

  // Delete
  const deleteItem = (id) => {
    fetch('/api/items/' + id, { method: 'DELETE' })
      .then(() => fetchItems());
  };

  return (
    <div style={{ maxWidth: '600px', margin: '50px auto', fontFamily: 'Arial' }}>
      <h1>Items Manager</h1>

      <div style={{ marginBottom: '20px' }}>
        <input
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          placeholder="Enter item name"
          style={{ padding: '8px', marginRight: '8px', width: '300px' }}
        />
        <button onClick={createItem} style={{ padding: '8px 16px' }}>Add Item</button>
      </div>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map(item => (
          <li key={item._id} style={{ padding: '10px', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {editId === item._id ? (
              <>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{ padding: '6px', width: '200px' }}
                />
                <button onClick={() => updateItem(item._id)}>Save</button>
                <button onClick={() => setEditId(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1 }}>{item.name}</span>
                <button onClick={() => { setEditId(item._id); setEditName(item.name); }}>Edit</button>
                <button onClick={() => deleteItem(item._id)}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;