const express = require('express');
const multer = require('multer');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const app = express();

// Configurar CORS para producción - AGREGADA URL ACTUAL DE LOVABLE
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://id-preview--7e1c36ed-fff7-4bde-8ecb-8ae0583f53ea.lovable.app', // ✅ URL actual
        'https://7e1c36ed-fff7-4bde-8ecb-8ae0583f53ea.lovableproject.com' // ✅ URL alternativa
      ]
    : true,
  credentials: true
}));

// AGREGADO: Middleware para parsear JSON
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

// AGREGADO: Endpoint para procesar video
app.post('/process', upload.single('video'), async (req, res) => {
  try {
    console.log('📥 Recibiendo video para procesar...');
    
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No se recibió ningún archivo de video' 
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
          console.log(`⏳ Progreso: ${Math.round(progress.percent)}%`);
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

// AGREGADO: Endpoint para generar miniatura
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📁 Upload dir: ${uploadDir}`);
  console.log(`📁 Output dir: ${outputDir}`);
  console.log(`🌐 CORS habilitado para producción`);
});