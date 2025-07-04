const express = require('express');
const multer = require('multer');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const app = express();

// Configurar CORS para producción
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://tu-frontend.vercel.app', 'https://tu-dominio.com']
    : true,
  credentials: true
}));

// Configurar directorio temporal para Render
const uploadDir = process.env.NODE_ENV === 'production' 
  ? '/tmp/uploads' 
  : path.join(__dirname, 'uploads');

const outputDir = process.env.NODE_ENV === 'production' 
  ? '/tmp/outputs' 
  : path.join(__dirname, 'outputs');

// Crear directorios
[uploadDir, outputDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Carpeta "${path.basename(dir)}" creada`);
  }
});

// Configurar multer para usar directorio temporal
const upload = multer({ 
  dest: uploadDir,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB límite
  }
});

// ... resto de tu código ...

// Endpoint de salud para Render
app.get('/', (req, res) => {
  res.json({ 
    status: 'Backend funcionando correctamente',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📁 Upload dir: ${uploadDir}`);
  console.log(`📁 Output dir: ${outputDir}`);
});