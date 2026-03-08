import React, { createContext, useContext, useReducer, useCallback } from 'react';

const ClaimContext = createContext();

export const useClaim = () => {
  const ctx = useContext(ClaimContext);
  if (!ctx) throw new Error('useClaim must be used within ClaimProvider');
  return ctx;
};

const initialState = {
  selectedInsurance: null,
  formData: {
    state: '',
    season: '',
    scheme: '',
    year: new Date().getFullYear(),
    insuranceNumber: '',
    cropType: '',
    farmArea: '',
    lossReason: '',
    lossDescription: '',
  },
  documentId: null,
  capturedMedia: {},
  processingResult: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_INSURANCE':
      return { ...state, selectedInsurance: action.payload };
    case 'SET_FORM_DATA':
      return { ...state, formData: { ...state.formData, ...action.payload } };
    case 'SET_DOCUMENT_ID':
      return { ...state, documentId: action.payload };
    case 'ADD_MEDIA':
      return { ...state, capturedMedia: { ...state.capturedMedia, [action.stepId]: action.payload } };
    case 'SET_RESULT':
      return { ...state, processingResult: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export const ClaimProvider = ({ children }) => {
  const [claimState, dispatch] = useReducer(reducer, initialState);

  const setSelectedInsurance = useCallback((ins) => dispatch({ type: 'SET_INSURANCE', payload: ins }), []);
  const updateFormData = useCallback((data) => dispatch({ type: 'SET_FORM_DATA', payload: data }), []);
  const setDocumentId = useCallback((id) => dispatch({ type: 'SET_DOCUMENT_ID', payload: id }), []);
  const addCapturedMedia = useCallback((stepId, data) => dispatch({ type: 'ADD_MEDIA', stepId, payload: data }), []);
  const setProcessingResult = useCallback((r) => dispatch({ type: 'SET_RESULT', payload: r }), []);
  const resetClaim = useCallback(() => dispatch({ type: 'RESET' }), []);

  const generateDocumentId = useCallback(() => {
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).substring(2, 9);
    const id = `CLM-${ts}-${rnd}`.toUpperCase();
    dispatch({ type: 'SET_DOCUMENT_ID', payload: id });
    return id;
  }, []);

  return (
    <ClaimContext.Provider
      value={{
        claimState,
        setSelectedInsurance,
        updateFormData,
        setDocumentId,
        generateDocumentId,
        addCapturedMedia,
        setProcessingResult,
        resetClaim,
      }}
    >
      {children}
    </ClaimContext.Provider>
  );
};
