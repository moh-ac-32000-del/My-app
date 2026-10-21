export const merchantExportLabels = {
  ar: {
    customerCredits: 'أرصدة العملاء الدائنة',
    merchants: 'التجار',
    merchantBalances: 'أرصدة التجار',
    merchantOperations: 'كشوف التجار الكاملة',
    merchant: 'عملية تاجر',
    balance: 'الرصيد الحالي',
    accountSign: 'رصيد العميل الموجب دين عليه، والسالب حق له. رصيد التاجر الموجب مستحق له، والسالب لصالح المتجر.',
    exactHint:
      'القيم التي تتجاوز دقة Excel محفوظة كنص عشري كامل دون تقريب. الأرصدة الحالية لا تعني أرصدة تاريخية بعد كل دفعة.',
    incompleteHint:
      'لا يمكن إنشاء ملف ناقص. افتح الأقسام الناقصة، وحمّل الصفحات الأقدم في كشوف التجار حتى تكتمل. فتح الشاشات قد يستهلك قراءات؛ زر الحفظ لا يجلب بيانات.',
    amount: 'المبلغ',
    cashEffect: 'أثر الصندوق',
    before: 'الرصيد قبل العملية',
    after: 'الرصيد بعد العملية',
    party: 'الطرف',
    correction: 'تصحيح',
  },
  en: {
    customerCredits: 'Customer credits',
    merchants: 'Merchants',
    merchantBalances: 'Merchant balances',
    merchantOperations: 'Complete merchant statements',
    merchant: 'Merchant operation',
    balance: 'Current balance',
    accountSign:
      'Positive customer balance: owed to the store. Negative: customer credit. Positive merchant balance: payable to merchant. Negative: store credit.',
    exactHint:
      'Values exceeding Excel precision are retained as full decimal text without rounding. Current balances are not historical balances after each payment.',
    incompleteHint:
      'Incomplete exports are blocked. Visit missing sections and load older merchant statement pages until complete. Screen loading can incur reads; saving never fetches data.',
    amount: 'Amount',
    cashEffect: 'Cash drawer effect',
    before: 'Balance before',
    after: 'Balance after',
    party: 'Party',
    correction: 'Correction',
  },
  tr: {
    customerCredits: 'Müşteri alacakları',
    merchants: 'Tedarikçiler',
    merchantBalances: 'Tedarikçi bakiyeleri',
    merchantOperations: 'Tam tedarikçi hesap dökümleri',
    merchant: 'Tedarikçi işlemi',
    balance: 'Güncel bakiye',
    accountSign:
      'Pozitif müşteri bakiyesi mağazaya borç, negatif müşteri alacağıdır. Pozitif tedarikçi bakiyesi ödenecek borç, negatif mağaza alacağıdır.',
    exactHint:
      'Excel hassasiyetini aşan tutarlar yuvarlanmadan tam ondalık metin olarak korunur. Güncel bakiyeler her ödeme sonrası geçmiş bakiye değildir.',
    incompleteHint:
      'Eksik dosya oluşturulmaz. Eksik bölümleri açın ve eski tedarikçi sayfalarını tamamlayın. Ekran yükleme okuma tüketebilir; kaydetme veri getirmez.',
    amount: 'Tutar',
    cashEffect: 'Kasaya etkisi',
    before: 'Önceki bakiye',
    after: 'Sonraki bakiye',
    party: 'Taraf',
    correction: 'Düzeltme',
  },
};
