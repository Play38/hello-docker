import React, { useState, useEffect } from 'react';

function App() {
  const [items, setItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [editName, setEditName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');

  // NEW: stores the presigned URL returned after upload
  const [presignedUrl, setPresignedUrl] = useState('');

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    const res = await fetch('/api/items');
    const data = await res.json();
    setItems(data);
  };

  const addItem = async () => {
    if (!newItemName.trim()) return;
    await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newItemName }),
    });
    setNewItemName('');
    fetchItems();
  };

  const deleteItem = async (id) => {
    await fetch('/api/items/' + id, { method: 'DELETE' });
    fetchItems();
  };

  const startEdit = (item) => {
    setEditingItem(item._id);
    setEditName(item.name);
  };

  const saveEdit = async (id) => {
    await fetch('/api/items/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    });
    setEditingItem(null);
    fetchItems();
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadStatus('Uploaded: ' + data.key);
        setPresignedUrl(data.url); // NEW: store presigned URL from response
      } else {
        setUploadStatus('Error: ' + data.error);
        setPresignedUrl('');
      }
    } catch (err) {
      setUploadStatus('Error: ' + err.message);
      setPresignedUrl('');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', fontFamily: 'Arial' }}>
      <h1>Items Manager</h1>

      <div>
        <input
          value={newItemName}
          onChange={e => setNewItemName(e.target.value)}
          placeholder="New item name"
        />
        <button onClick={addItem}>Add</button>
      </div>

      <ul>
        {items.map(item => (
          <li key={item._id}>
            {editingItem === item._id ? (
              <>
                <input value={editName} onChange={e => setEditName(e.target.value)} />
                <button onClick={() => saveEdit(item._id)}>Save</button>
                <button onClick={() => setEditingItem(null)}>Cancel</button>
              </>
            ) : (
              <>
                {item.name}
                <button onClick={() => startEdit(item)}>Edit</button>
                <button onClick={() => deleteItem(item._id)}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>

      <hr />

      <h2>Upload File to MinIO</h2>
      <div>
        <input
          type="file"
          onChange={e => setSelectedFile(e.target.files[0])}
        />
        <button onClick={handleUpload} disabled={!selectedFile}>
          Upload
        </button>
      </div>
      {uploadStatus && <p>{uploadStatus}</p>}
      {presignedUrl && (
        <p>
          <a href={presignedUrl} target="_blank" rel="noreferrer">
            View uploaded file (link expires in 1 hour)
          </a>
        </p>
      )}
    </div>
  );
}

export default App;
