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
    
    const packageDoc = await db.collection('packages').doc(String(packageId)).get();
    
    if (!packageDoc.exists) {
        return res.status(400).json({ error: 'Pacote inválido ou excluído do sistema.' });
    }
    
    const selectedPackage = packageDoc.data();

    // Pega o token seguro das variáveis da Vercel
    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const payment = new Payment(client);
    
    const paymentIdStr = `recarga_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // 🔥 CORREÇÃO AQUI: URL estrita de produção. Nunca será bloqueada com erro 401.
    const webhookUrl = 'https://cryptopulse-kappa.vercel.app/api/webhook';

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
