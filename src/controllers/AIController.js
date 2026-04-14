const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const AiKnowledge = require('../models/AiKnowledge');

// Configure multer for temporary file uploads
const upload = multer({
  dest: path.join(__dirname, '../../uploads/ai-temp/'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.md', '.csv', '.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

const uploadMiddleware = upload.single('file');

const systemInstruction = `
Bạn là Trợ lý Doanh nghiệp chuyên biệt cho dự án "IUH Campus Exchange" (hệ thống OTT/Chat doanh nghiệp).
Nhiệm vụ của bạn là hỗ trợ nhân viên về các vấn đề liên quan đến dự án, doanh nghiệp và quy định nội bộ.

QUY TẮC VÀ KIẾN THỨC:
1. TIẾP NHẬN KIẾN THỨC MỚI: Khi người dùng gửi file đính kèm với yêu cầu "Học", "Tóm tắt"..., bạn PHẢI đọc nội dung, xác nhận và coi đó là nguồn kiến thức bổ sung để hỗ trợ.
2. PHẠM VI HỖ TRỢ: Tập trung vào dự án IUH Campus Exchange, quy định công ty, VÀ các kiến thức chuyên môn rộng hơn như: quản trị dự án, quy trình làm việc chuyên nghiệp, kỹ thuật lập trình, và văn hóa doanh nghiệp.
3. GIỚI HẠN: Chỉ từ chối các câu hỏi hoàn toàn không liên quan đến công việc hoặc doanh nghiệp (ví dụ: giải trí cá nhân, nấu ăn). Bạn được phép sử dụng kiến thức sẵn có của mình về các chủ đề chuyên môn doanh nghiệp để tư vấn cho người dùng.

VỀ DỰ ÁN IUH CAMPUS EXCHANGE:
- Đây là hệ thống OTT cho phép nhắn tin, gọi thoại/video (WebRTC), quản lý bạn bè và thông báo.
- Công nghệ: Node.js, Spring Boot, React, MongoDB, Redis.

QUY ĐỊNH CÔNG TY (noiquycongty.txt):
- Thời gian: T2-T6 (8h00 - 17h30). Nghiêm cấm vi phạm bảo mật và làm việc riêng.
`;

// Helper: Get Embedding from Gemini
const getEmbedding = async (text, apiKey) => {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        content: { parts: [{ text }] }
      }
    );
    return response.data?.embedding?.values || [];
  } catch (error) {
    console.error('[AI] Embedding Error:', error.response?.data || error.message);
    return [];
  }
};

// Helper: Cosine Similarity
const calculateSimilarity = (vecA, vecB) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// Ingest knowledge from file
const ingestKnowledge = async (file, apiKey) => {
  try {
    const fileName = file.originalname;
    let fullText = '';

    if (fileName.toLowerCase().endsWith('.pdf')) {
      const dataBuffer = fs.readFileSync(file.path);
      const pdfData = await pdfParse(dataBuffer);
      fullText = pdfData.text;
    } else {
      fullText = fs.readFileSync(file.path, 'utf8');
    }

    // Chunking (~1000 characters per chunk)
    const chunks = fullText.match(/[\s\S]{1,1000}/g) || [];
    
    const knowledgeEntries = [];
    for (const chunk of chunks) {
      if (chunk.trim().length < 10) continue;
      
      const embedding = await getEmbedding(chunk.trim(), apiKey);
      if (embedding.length > 0) {
        knowledgeEntries.push({
          fileName,
          textChunk: chunk.trim(),
          embeddingVector: embedding
        });
      }
    }

    if (knowledgeEntries.length > 0) {
      await AiKnowledge.insertMany(knowledgeEntries);
      console.log(`[AI] Ingested ${knowledgeEntries.length} chunks from ${fileName}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[AI] Ingestion failed:', error.message);
    return false;
  } finally {
    try { fs.unlinkSync(file.path); } catch (e) { }
  }
};

const askAI = async (req, res) => {
  try {
    const message = req.body.message;
    const file = req.file;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({ success: true, data: "AI đang bận (Thiếu API Key)." });
    }

    // Handle File Upload (Knowledge Ingestion)
    if (file) {
      const success = await ingestKnowledge(file, apiKey);
      if (success) {
        return res.json({ 
          success: true, 
          data: `✅ Đã học xong tài liệu [${file.originalname}]. Dữ liệu đã được nạp vĩnh viễn vào Bộ nhớ Vector. Bạn có thể bắt đầu đặt câu hỏi liên quan đến tài liệu này!` 
        });
      }
      return res.json({ success: true, data: "❌ Có lỗi khi nạp tài liệu. Vui lòng thử lại." });
    }

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    // STEP 1: Process User Question into Vector
    const questionVector = await getEmbedding(message, apiKey);
    let contextFromDB = '';

    // STEP 2: Retrieval from MongoDB if vector exists
    if (questionVector.length > 0) {
      const allKnowledge = await AiKnowledge.find({});
      
      const scoredChunks = allKnowledge
        .map(k => ({
          chunk: k.textChunk,
          fileName: k.fileName,
          score: calculateSimilarity(questionVector, k.embeddingVector)
        }))
        .filter(k => k.score > 0.6) // Threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      if (scoredChunks.length > 0) {
        contextFromDB = "\n\n*** KIẾN THỨC NỘI BỘ TRÍCH XUẤT TỪ DATABASE ***\n";
        scoredChunks.forEach(item => {
          contextFromDB += `[Tài liệu: ${item.fileName}]: ${item.chunk}\n`;
        });
      }
    }

    console.log(`[AI] Processing request: "${message.substring(0, 50)}..."`);

    // Call Gemini with Injected Context
    const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
    let aiResponse = null;

    for (const model of models) {
      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ parts: [{ text: contextFromDB + "\n\nCâu hỏi: " + message }] }]
          },
          {
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' }
          }
        );

        aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (aiResponse) break;
      } catch (err) {
        if (err.response?.status !== 429) break;
      }
    }

    res.json({ success: true, data: aiResponse || "AI đang quá tải." });
  } catch (error) {
    console.error('[AI] Request Failed:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi kết nối AI.' });
  }
};

module.exports = { askAI, uploadMiddleware };
