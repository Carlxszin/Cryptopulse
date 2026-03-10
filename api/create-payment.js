import { MercadoPagoConfig, Payment } from 'mercadopago';
import admin from 'firebase-admin';

// Inicializa o Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { packageId, phone, operator, userId } = req.body;
    
    // 1. Vai buscar o preço do pacote diretamente ao Firebase
    const packageDoc = await db.collection('packages').doc(String(packageId)).get();
    
    if (!packageDoc.exists) {
        // Se o pacote não existir na base de dados, bloqueia o pagamento
        return res.status(400).json({ error: 'Pacote inválido ou excluído do sistema.' });
    }
    
    const selectedPackage = packageDoc.data();

    // 2. Configurar Mercado Pago
    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'APP_USR-2500067834250187-010423-aafec158951970e814b7db68138a86a9-2485490772';
    const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const payment = new Payment(client);
    
    const paymentIdStr = `recarga_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const webhookUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/webhook` 
      : 'https://cryptopulse-kappa.vercel.app/api/webhook';

    // 3. Criar o PIX usando o preço oficial que veio da base de dados (selectedPackage.pay)
    const paymentResponse = await payment.create({
      body: {
        transaction_amount: Number(selectedPackage.pay),
        description: selectedPackage.discount ? `Recarga - ${selectedPackage.discount}` : 'Recarga',
        payment_method_id: 'pix',
        payer: { email: 'contato@recargafast.com' },
        external_reference: paymentIdStr,
        notification_url: webhookUrl
      }
    });

    // 4. Salvar encomenda no Firestore
    await db.collection('orders').doc(paymentIdStr).set({
      packageId, phone, operator,
      pricePaid: Number(selectedPackage.pay),
      status: 'pending',
      mpPaymentId: paymentResponse.id,
      userId: userId || 'anonymous',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      paymentId: paymentIdStr,
      qrCodeBase64: paymentResponse.point_of_interaction.transaction_data.qr_code_base64,
      qrCodeString: paymentResponse.point_of_interaction.transaction_data.qr_code
    });

  } catch (error) {
    console.error('Erro ao gerar pagamento:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
