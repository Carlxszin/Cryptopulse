export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  
    // O Frontend vai puxar os valores daqui. 
    // Assim, se você quiser mudar um preço amanhã, basta mudar neste arquivo!
    const CATALOG = [
      { id: 1, value: 15, pay: 12, discount: '20% OFF' },
      { id: 2, value: 20, pay: 15, discount: '25% OFF' },
      { id: 3, value: 30, pay: 20, discount: '33% OFF', popular: true },
      { id: 4, value: 40, pay: 30, discount: '25% OFF' },
      { id: 5, value: 50, pay: 35, discount: '30% OFF' },
    ];
  
    res.status(200).json(CATALOG);
  }
