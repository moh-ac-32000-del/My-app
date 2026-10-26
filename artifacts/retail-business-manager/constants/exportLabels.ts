import type { Language } from './i18n';

export const exportLabels = {
  ar: {
    info: 'بيانات التصدير', customers: 'العملاء', debts: 'الديون', payments: 'الدفعات', transactions: 'حركات الصندوق', dailyArchives: 'الإغلاقات', archiveEvents: 'تفاصيل الإغلاقات', closingBalances: 'أرصدة الإغلاق',
    id: 'المعرّف', name: 'الاسم', phone: 'الهاتف', address: 'العنوان', notes: 'ملاحظات', isActive: 'نشط', createdAt: 'وقت الإنشاء UTC', updatedAt: 'آخر تعديل UTC', customerId: 'معرّف العميل', currency: 'العملة', originalAmount: 'مبلغ الدين الأصلي المسجل', amount: 'المبلغ', dueDate: 'تاريخ الاستحقاق', settledAt: 'وقت التسوية UTC', transactionId: 'معرّف حركة الصندوق', direction: 'الاتجاه', method: 'طريقة الدفع', paidAt: 'وقت الدفع UTC', note: 'ملاحظة', type: 'النوع', date: 'تاريخ الإغلاق', closedAt: 'وقت الإغلاق UTC', closingNumber: 'رقم الإغلاق', hasClosingBalances: 'يتوفر رصيد إغلاق مسجل', eventCount: 'عدد الأحداث', archiveId: 'معرّف الإغلاق', sourceId: 'معرّف المصدر', customerName: 'اسم العميل', occurredAt: 'وقت الحدث UTC',
    store: 'المتجر', scope: 'معرّف مساحة العمل', storeId: 'معرّف المتجر', exportedAt: 'وقت التصدير UTC', version: 'إصدار التنسيق', source: 'مصدر البيانات', warning: 'ملف مقروء غير مشفر. تصدير للمراجعة فقط، وليس نسخة لاستعادة التطبيق. لا تُجمع العملات المختلفة. مبلغ الديون هو المتبقي؛ مبالغ الدفعات والحركات والأحداث منفصلة ولا تُجمع معًا. غياب رصيد إغلاق قديم لا يعني صفرًا.',
  },
  en: {
    info: 'Export details', customers: 'Customers', debts: 'Debts', payments: 'Payments', transactions: 'Cash movements', dailyArchives: 'Closings', archiveEvents: 'Closing events', closingBalances: 'Closing balances',
    id: 'ID', name: 'Name', phone: 'Phone', address: 'Address', notes: 'Notes', isActive: 'Active', createdAt: 'Created UTC', updatedAt: 'Updated UTC', customerId: 'Customer ID', currency: 'Currency', originalAmount: 'Recorded original debt', amount: 'Amount', dueDate: 'Due date', settledAt: 'Settled UTC', transactionId: 'Cash movement ID', direction: 'Direction', method: 'Payment method', paidAt: 'Paid UTC', note: 'Note', type: 'Type', date: 'Closing date', closedAt: 'Closed UTC', closingNumber: 'Closing number', hasClosingBalances: 'Recorded closing balance available', eventCount: 'Event count', archiveId: 'Closing ID', sourceId: 'Source ID', customerName: 'Customer name', occurredAt: 'Occurred UTC',
    store: 'Store', scope: 'Workspace ID', storeId: 'Store ID', exportedAt: 'Exported UTC', version: 'Format version', source: 'Data source', warning: 'Readable, unencrypted review export, not an application restore backup. Do not combine different currencies. Debt amount is remaining debt; payments, cash movements and events are separate views and must not be added together. A missing legacy closing balance does not mean zero.',
  },
  tr: {
    info: 'Dışa aktarma bilgileri', customers: 'Müşteriler', debts: 'Borçlar', payments: 'Ödemeler', transactions: 'Kasa hareketleri', dailyArchives: 'Kapanışlar', archiveEvents: 'Kapanış ayrıntıları', closingBalances: 'Kapanış bakiyeleri',
    id: 'Kimlik', name: 'Ad', phone: 'Telefon', address: 'Adres', notes: 'Notlar', isActive: 'Aktif', createdAt: 'Oluşturma UTC', updatedAt: 'Güncelleme UTC', customerId: 'Müşteri kimliği', currency: 'Para birimi', originalAmount: 'Kayıtlı ilk borç', amount: 'Tutar', dueDate: 'Vade tarihi', settledAt: 'Kapatılma UTC', transactionId: 'Kasa hareketi kimliği', direction: 'Yön', method: 'Ödeme yöntemi', paidAt: 'Ödeme UTC', note: 'Not', type: 'Tür', date: 'Kapanış tarihi', closedAt: 'Kapanış UTC', closingNumber: 'Kapanış numarası', hasClosingBalances: 'Kayıtlı kapanış bakiyesi mevcut', eventCount: 'Olay sayısı', archiveId: 'Kapanış kimliği', sourceId: 'Kaynak kimliği', customerName: 'Müşteri adı', occurredAt: 'Olay zamanı UTC',
    store: 'Mağaza', scope: 'Çalışma alanı kimliği', storeId: 'Mağaza kimliği', exportedAt: 'Dışa aktarma UTC', version: 'Biçim sürümü', source: 'Veri kaynağı', warning: 'Okunabilir, şifrelenmemiş inceleme dosyasıdır. Uygulama geri yükleme yedeği değildir. Farklı para birimlerini toplamayın. Borç tutarı kalan borçtur; ödemeler, kasa hareketleri ve olaylar ayrı görünümlerdir, birlikte toplanmamalıdır. Eski kapanış bakiyesinin bulunmaması sıfır olduğu anlamına gelmez.',
  },
} satisfies Record<Language, Record<string, string>>;

/** Reader-facing values, not translations of names or notes written by the user. */
export const exportReportLabels = {
  ar: {
    remainingDebt: 'الدين المتبقي', customerPhone: 'هاتف العميل', archiveLabel: 'الإغلاق',
    isActive: 'الحالة', active: 'نشط', inactive: 'غير نشط', yes: 'نعم', no: 'لا',
    missingCustomer: 'اسم العميل غير متاح محليًا', unnamedCustomer: 'اسم العميل غير مسجل', noCustomer: 'غير مرتبط بعميل',
    localSource: 'بيانات الحساب المحمّلة في هذه الجلسة',
    technicalHint: 'مراجع الربط التقنية محفوظة في أعمدة مخفية بنهاية الجداول. الأسماء والملاحظات كما كتبها المستخدم. أوقات البيانات بالتوقيت العالمي (UTC).',
    cash_in: 'إيداع في الصندوق', cash_out: 'سحب من الصندوق', debt: 'دين', settlement: 'سداد دين',
    in: 'وارد', out: 'صادر', cash: 'نقدًا', card: 'بطاقة', 'bank-transfer': 'تحويل بنكي', other: 'أخرى',
  },
  en: {
    remainingDebt: 'Remaining debt', customerPhone: 'Customer phone', archiveLabel: 'Closing',
    isActive: 'Status', active: 'Active', inactive: 'Inactive', yes: 'Yes', no: 'No',
    missingCustomer: 'Customer name unavailable locally', unnamedCustomer: 'Customer name not recorded', noCustomer: 'Not linked to a customer',
    localSource: 'Account data loaded in this session',
    technicalHint: 'Technical references remain in hidden columns at the end of each table. User-entered names and notes are unchanged. Data times are UTC.',
    cash_in: 'Cash deposit', cash_out: 'Cash withdrawal', debt: 'Debt', settlement: 'Debt repayment',
    in: 'Incoming', out: 'Outgoing', cash: 'Cash', card: 'Card', 'bank-transfer': 'Bank transfer', other: 'Other',
  },
  tr: {
    remainingDebt: 'Kalan borç', customerPhone: 'Müşteri telefonu', archiveLabel: 'Kapanış',
    isActive: 'Durum', active: 'Aktif', inactive: 'Pasif', yes: 'Evet', no: 'Hayır',
    missingCustomer: 'Müşteri adı yerel veride yok', unnamedCustomer: 'Müşteri adı kaydedilmemiş', noCustomer: 'Müşteriye bağlı değil',
    localSource: 'Bu oturumda yüklenen hesap verileri',
    technicalHint: 'Teknik referanslar tabloların sonundaki gizli sütunlarda korunur. Kullanıcının yazdığı adlar ve notlar değiştirilmez. Veri saatleri UTC olarak gösterilir.',
    cash_in: 'Kasaya para girişi', cash_out: 'Kasadan para çıkışı', debt: 'Borç', settlement: 'Borç ödemesi',
    in: 'Gelen', out: 'Giden', cash: 'Nakit', card: 'Kart', 'bank-transfer': 'Banka havalesi', other: 'Diğer',
  },
} satisfies Record<Language, Record<string, string>>;
