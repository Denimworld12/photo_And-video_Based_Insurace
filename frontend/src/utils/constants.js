export const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

export const SEASONS = ['Kharif', 'Rabi', 'Summer'];

export const CROP_TYPES = [
    'Rice', 'Wheat', 'Maize', 'Cotton', 'Sugarcane', 'Soybean', 'Groundnut',
    'Mustard', 'Sunflower', 'Barley', 'Bajra', 'Jowar', 'Tur', 'Gram'
];

export const LOSS_REASONS = [
    'drought', 'flood', 'pest', 'disease', 'hail', 'cyclone', 'other'
];

export const CLAIM_STATUS = {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    PROCESSING: 'processing',
    FIELD_VERIFICATION: 'field-verification',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    PAYOUT_PENDING: 'payout-pending',
    PAYOUT_COMPLETE: 'payout-complete',
    DISPUTED: 'disputed'
};

/**
 * Contact details shown in the app. Kept here so the footer, the settings
 * page and the support prompts cannot drift apart.
 */
export const SUPPORT = {
    helpline: '1800-180-1551',
    helplineNote: 'Toll free',
    email: 'support@pbi-agriinsure.in',
    office: 'Ministry of Agriculture & Farmers Welfare, New Delhi',
};

export const APP_NAME = 'PBI AgriInsure';
export const APP_TAGLINE = 'Crop Insurance Platform';
