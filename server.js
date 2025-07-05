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

// ✅ Función auxiliar para limpiar archivos de forma segura
function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Archivo eliminado: ${path.basename(filePath)}`);
    }
  } catch (error) {
    console.error(`⚠️ Error eliminando archivo ${filePath}:`, error.message);
  }
}

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

// ✅ Endpoint para procesar video CON miniatura integrada
app.post('/process', upload.single('video'), async (req, res) => {
  let inputPath = null;
  let outputPath = null;
  let thumbnailPath = null;

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

    inputPath = req.file.path;
    const outputFilename = `processed_${Date.now()}.mp4`;
    outputPath = path.join(outputDir, outputFilename);
    const thumbnailFilename = `thumbnail_${Date.now()}.jpg`;
    thumbnailPath = path.join(outputDir, thumbnailFilename);

    console.log(`📹 Procesando video: ${req.file.originalname}`);
    console.log(`📊 Tamaño: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // Procesar video con FFmpeg
   await new Promise((resolve, reject) => {
  ffmpeg(inputPath)
    .videoFilters({
      filter: 'drawtext',
      options: {
        fontfile: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        text: timestamp,
        fontsize: 24,
        fontcolor: 'white',
        box: 1,
        boxcolor: 'black@0.5',
        boxborderw: 5,
        x: '(w-text_w)-10',
        y: 10
      }
    })
    .output(outputPath)
    .videoCodec('libx264')
    .audioCodec('aac')
    .format('mp4')
    .size('1280x720')
    .fps(30)
    .videoBitrate('2000k')
    .audioBitrate('128k')
    .on('start', command => {
      console.log('🎬 FFmpeg iniciado:', command);
    })
    .on('progress', progress => {
      console.log(`⏳ Progreso: ${Math.round(progress.percent || 0)}%`);
    })
    .on('end', () => {
      console.log('✅ Video procesado exitosamente');
      resolve();
    })
    .on('error', err => {
      console.error('❌ Error en FFmpeg:', err);
      reject(err);
    })
    .run();
});

    // Verificar que el video se procesó correctamente
    if (!fs.existsSync(outputPath)) {
      throw new Error('El video no se procesó correctamente');
    }

    // Generar miniatura del video procesado
    let thumbnailBase64 = null;
    try {
      console.log('📸 Generando miniatura...');
      
      await new Promise((resolve, reject) => {
        ffmpeg(outputPath) // Usar el video procesado como fuente
          .seekInput(1) // Ir al segundo 1
          .frames(1) // Capturar solo 1 frame
          .size('320x240') // Tamaño de la miniatura
          .format('image2') // Formato de imagen
          .output(thumbnailPath)
          .timeout(30) // Timeout de 30 segundos para miniatura
          .on('start', (commandLine) => {
            console.log('🎬 FFmpeg iniciado para miniatura:', commandLine);
          })
          .on('end', () => {
            console.log('✅ Miniatura generada exitosamente');
            resolve();
          })
          .on('error', (err) => {
            console.error('❌ Error generando miniatura:', err);
            reject(err);
          })
          .run();
      });

      // Leer miniatura y convertir a base64
      if (fs.existsSync(thumbnailPath)) {
        const thumbnailBuffer = fs.readFileSync(thumbnailPath);
        thumbnailBase64 = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
        console.log(`📸 Miniatura generada, tamaño: ${thumbnailBuffer.length} bytes`);
      }
    } catch (thumbnailError) {
      console.error('⚠️ Error generando miniatura (continuando sin ella):', thumbnailError);
      // Continuar sin miniatura si hay error
    }

    // Leer archivo procesado para enviarlo como respuesta
    const processedVideoBuffer = fs.readFileSync(outputPath);
    const processedVideoBase64 = processedVideoBuffer.toString('base64');

    // Respuesta exitosa con video y miniatura
    res.json({
      success: true,
      message: 'Video procesado exitosamente',
      originalName: req.file.originalname,
      originalSize: req.file.size,
      processedSize: processedVideoBuffer.length,
      processedVideo: `data:video/mp4;base64,${processedVideoBase64}`,
      thumbnail: thumbnailBase64, // Incluir miniatura aquí (puede ser null)
      timestamp: new Date().toISOString()
    });

    // Limpiar archivos temporales
    safeUnlink(inputPath);
    safeUnlink(outputPath);
    safeUnlink(thumbnailPath);
    
  } catch (error) {
    console.error('❌ Error procesando video:', error);
    
    // Limpiar archivos temporales en caso de error
    safeUnlink(inputPath);
    safeUnlink(outputPath);
    safeUnlink(thumbnailPath);
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ Endpoint para generar miniatura (CORREGIDO pero mantenido para compatibilidad)
app.post('/thumbnail', upload.single('video'), async (req, res) => {
  let inputPath = null;
  let thumbnailPath = null;

  try {
    console.log('📸 Generando miniatura...');
    
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No se recibió ningún archivo de video' 
      });
    }

    inputPath = req.file.path;
    const thumbnailFilename = `thumbnail_${Date.now()}.jpg`;
    thumbnailPath = path.join(outputDir, thumbnailFilename);

    console.log(`📸 Entrada: ${inputPath}`);
    console.log(`📸 Salida: ${thumbnailPath}`);

    // Generar miniatura usando el método correcto
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(1) // Ir al segundo 1
        .frames(1) // Capturar solo 1 frame
        .size('320x240') // Tamaño de la miniatura
        .format('image2') // Formato de imagen
        .output(thumbnailPath)
        .timeout(30) // Timeout de 30 segundos
        .on('start', (commandLine) => {
          console.log('🎬 FFmpeg iniciado para miniatura:', commandLine);
        })
        .on('end', () => {
          console.log('✅ Miniatura generada exitosamente');
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ Error generando miniatura:', err);
          reject(err);
        })
        .run();
    });

    // Verificar que el archivo se creó
    if (!fs.existsSync(thumbnailPath)) {
      throw new Error('La miniatura no se generó correctamente');
    }

    // Leer miniatura y convertir a base64
    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    const thumbnailBase64 = thumbnailBuffer.toString('base64');

    console.log(`📸 Miniatura generada, tamaño: ${thumbnailBuffer.length} bytes`);

    res.json({
      success: true,
      message: 'Miniatura generada exitosamente',
      thumbnail: `data:image/jpeg;base64,${thumbnailBase64}`,
      size: thumbnailBuffer.length,
      timestamp: new Date().toISOString()
    });

    // Limpiar archivos temporales
    safeUnlink(inputPath);
    safeUnlink(thumbnailPath);
    
  } catch (error) {
    console.error('❌ Error generando miniatura:', error);
    
    // Limpiar archivos temporales en caso de error
    safeUnlink(inputPath);
    safeUnlink(thumbnailPath);
    
    res.status(500).json({ 
      error: 'Error interno del servidor generando miniatura',
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
  console.log(`   POST /process (con miniatura integrada)`);
  console.log(`   POST /thumbnail (corregido)`);
});