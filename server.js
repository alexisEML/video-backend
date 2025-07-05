const express = require('express');
const multer = require('multer');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const app = express();

// ✅ CORS más permisivo para debugging
app.use(cors({
  origin: function(origin, callback) {
    // Permitir requests sin origin (como Postman) y desde Lovable
    if (!origin || origin.includes('lovable.app') || origin.includes('lovableproject.com')) {
      callback(null, true);
    } else {
      callback(null, true); // Temporalmente permitir todo para debugging
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ✅ Middleware para parsear JSON ANTES de las rutas
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ✅ Middleware de logging para debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  next();
});

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

// ✅ Endpoint de salud para Render
app.get('/', (req, res) => {
  res.json({ 
    status: 'Backend funcionando correctamente',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    routes: [
      'GET /',
      'GET /health',
      'POST /process',
      'POST /thumbnail'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// ✅ Endpoint para procesar video
app.post('/process', upload.single('video'), async (req, res) => {
  try {
    console.log('📥 Recibiendo video para procesar...');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No se recibió ningún archivo de video',
        received: {
          body: req.body,
          files: req.files,
          file: req.file
        }
      });
    }

    const inputPath = req.file.path;
    const outputFilename = `processed_${Date.now()}.mp4`;
    const outputPath = path.join(outputDir, outputFilename);

    console.log(`📹 Procesando video: ${req.file.originalname}`);
    console.log(`📊 Tamaño: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // Procesar video con FFmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .format('mp4')
        .size('1280x720') // Redimensionar a 720p
        .fps(30) // 30 FPS
        .videoBitrate('2000k') // 2 Mbps
        .audioBitrate('128k') // 128 kbps
        .on('start', (commandLine) => {
          console.log('🎬 FFmpeg iniciado:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`⏳ Progreso: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          console.log('✅ Video procesado exitosamente');
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ Error en FFmpeg:', err);
          reject(err);
        })
        .run();
    });

    // Leer archivo procesado para enviarlo como respuesta
    const processedVideoBuffer = fs.readFileSync(outputPath);
    const processedVideoBase64 = processedVideoBuffer.toString('base64');

    // Respuesta exitosa
    res.json({
      success: true,
      message: 'Video procesado exitosamente',
      originalName: req.file.originalname,
      originalSize: req.file.size,
      processedSize: processedVideoBuffer.length,
      processedVideo: `data:video/mp4;base64,${processedVideoBase64}`,
      timestamp: new Date().toISOString()
    });

    // Limpiar archivos temporales
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);
    
  } catch (error) {
    console.error('❌ Error procesando video:', error);
    
    // Limpiar archivo temporal en caso de error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ Endpoint para generar miniatura
app.post('/thumbnail', upload.single('video'), async (req, res) => {
  try {
    console.log('📸 Generando miniatura...');
    
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No se recibió ningún archivo de video' 
      });
    }

    const inputPath = req.file.path;
    const thumbnailFilename = `thumbnail_${Date.now()}.jpg`;
    const thumbnailPath = path.join(outputDir, thumbnailFilename);

    // Generar miniatura en el segundo 1
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: ['00:00:01'],
          filename: thumbnailFilename,
          folder: outputDir,
          size: '320x240'
        })
        .on('end', () => {
          console.log('✅ Miniatura generada');
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ Error generando miniatura:', err);
          reject(err);
        });
    });

    // Leer miniatura y convertir a base64
    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    const thumbnailBase64 = thumbnailBuffer.toString('base64');

    res.json({
      success: true,
      message: 'Miniatura generada exitosamente',
      thumbnail: `data:image/jpeg;base64,${thumbnailBase64}`,
      timestamp: new Date().toISOString()
    });

    // Limpiar archivos temporales
    fs.unlinkSync(inputPath);
    fs.unlinkSync(thumbnailPath);
    
  } catch (error) {
    console.error('❌ Error generando miniatura:', error);
    
    // Limpiar archivo temporal en caso de error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    path: req.path,
    method: req.method,
    availableRoutes: [
      'GET /',
      'GET /health',
      'POST /process',
      'POST /thumbnail'
    ]
  });
});

// ✅ Manejo de errores globales
app.use((error, req, res, next) => {
  console.error('Error global:', error);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: error.message
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📁 Upload dir: ${uploadDir}`);
  console.log(`📁 Output dir: ${outputDir}`);
  console.log(`🌐 CORS habilitado para producción`);
  console.log(`📍 Endpoints disponibles:`);
  console.log(`   GET  /`);
  console.log(`   GET  /health`);
  console.log(`   POST /process`);
  console.log(`   POST /thumbnail`);
});