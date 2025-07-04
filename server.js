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
    ? [
        'https://id-preview--7e1c36ed-fff7-4bde-8ecb-8ae0583f53ea.lovable.app', // ✅ URL actual
        'https://7e1c36ed-fff7-4bde-8ecb-8ae0583f53ea.lovableproject.com'
      ]
    : true,
  credentials: true
}));

// Middleware para parsear JSON
app.use(express.json());

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

// Endpoint para procesar video
app.post('/process', upload.single('video'), async (req, res) => {
  try {
    console.log('📥 Recibiendo video para procesar...');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(outputDir, `processed_${Date.now()}.mp4`);

    console.log(`📹 Procesando: ${inputPath}`);
    console.log(`📄 Archivo: ${req.file.originalname}, Tamaño: ${req.file.size} bytes`);
    
    // Aquí puedes agregar tu lógica de procesamiento con FFmpeg
    // Por ejemplo:
    /*
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    */
    
    res.json({
      success: true,
      message: 'Video procesado exitosamente',
      originalName: req.file.originalname,
      size: req.file.size,
      timestamp: new Date().toISOString()
    });

    // Limpiar archivo temporal
    fs.unlinkSync(inputPath);
    
  } catch (error) {
    console.error('❌ Error procesando video:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📁 Upload dir: ${uploadDir}`);
  console.log(`📁 Output dir: ${outputDir}`);
});