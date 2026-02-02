import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import './ClaimsList.css';

const ClaimsList = () => {
    const [claims, setClaims] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchClaims();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter, currentPage]);

    const fetchClaims = async () => {
        try {
            setLoading(true);
            setError(null);

            // ✅ OPTION 1: Try to fetch from real API first
            try {
                const response = await api.get('/api/claims/list', {
                    params: {
                        filter: filter !== 'all' ? filter : undefined,
                        page: currentPage,
                        limit: 10
                    }
                });

                if (response.data.success && response.data.claims) {
                    setClaims(response.data.claims);
                    setTotalPages(response.data.totalPages || 1);
                    console.log('✅ Claims loaded from API');
                    return;
                }
            } catch (apiError) {
                // If API fails, fall back to mock data
                console.log('⚠️ API not available, using mock data');
            }

            // ✅ OPTION 2: Fallback to mock data (for development/demo)
            const mockClaims = [
                {
                    _id: '1',
                    documentId: 'CLM-2025-001234',
                    status: 'processing',
                    formData: {
                        cropType: 'Rice',
                        farmArea: 5.5,
                        state: 'Maharashtra',
                        district: 'Pune',
                        season: 'Kharif'
                    },
                    insuranceId: { name: 'PM Fasal Bima Yojana', type: 'crop' },
                    submittedAt: new Date().toISOString(),
                    processingResult: {
                        risk: 'low',
                        phases: {
                            damageAssessment: { percentage: 25 }
                        }
                    }
                },
                {
                    _id: '2',
                    documentId: 'CLM-2025-001235',
                    status: 'approved',
                    formData: {
                        cropType: 'Wheat',
                        farmArea: 3.2,
                        state: 'Punjab',
                        district: 'Ludhiana',
                        season: 'Rabi'
                    },
                    insuranceId: { name: 'Weather Based Crop Insurance', type: 'crop' },
                    submittedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    approvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                    financial: { approvedAmount: 15000 },
                    processingResult: {
                        risk: 'medium',
                        phases: {
                            damageAssessment: { percentage: 40 }
                        }
                    }
                },
                {
                    _id: '3',
                    documentId: 'CLM-2025-001236',
                    status: 'payout-complete',
                    formData: {
                        cropType: 'Cotton',
                        farmArea: 4.8,
                        state: 'Gujarat',
                        district: 'Ahmedabad',
                        season: 'Kharif'
                    },
                    insuranceId: { name: 'Comprehensive Crop Insurance', type: 'crop' },
                    submittedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
                    approvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    payoutDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                    financial: { approvedAmount: 28000, paidAmount: 28000 },
                    processingResult: {
                        risk: 'high',
                        phases: {
                            damageAssessment: { percentage: 65 }
                        }
                    }
                },
                {
                    _id: '4',
                    documentId: 'CLM-2025-001237',
                    status: 'rejected',
                    formData: {
                        cropType: 'Sugarcane',
                        farmArea: 2.1,
                        state: 'Uttar Pradesh',
                        district: 'Muzaffarnagar',
                        season: 'Annual'
                    },
                    insuranceId: { name: 'PM Fasal Bima Yojana', type: 'crop' },
                    submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                    rejectedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    rejectionReason: 'Insufficient evidence of damage. Additional documentation required.',
                    processingResult: {
                        risk: 'low',
                        phases: {
                            damageAssessment: { percentage: 8 }
                        }
                    }
                }
            ];

            const filteredClaims = filter === 'all'
                ? mockClaims
                : mockClaims.filter(claim => claim.status === filter);

            setClaims(filteredClaims);
            setTotalPages(1);

        } catch (error) {
            console.error('Failed to fetch claims:', error);
            setError('Failed to load claims. Please try again.');
            setClaims([]);
        } finally {
            setLoading(false);
        }
    };

    const getStatusConfig = (status) => {
        const configs = {
            draft: { color: '#6b7280', label: 'Draft', icon: 'document' },
            submitted: { color: '#2563eb', label: 'Submitted', icon: 'upload' },
            processing: { color: '#f59e0b', label: 'Processing', icon: 'clock' },
            approved: { color: '#10b981', label: 'Approved', icon: 'check' },
            rejected: { color: '#ef4444', label: 'Rejected', icon: 'x' },
            'payout-complete': { color: '#8b5cf6', label: 'Completed', icon: 'money' }
        };
        return configs[status] || configs.draft;
    };

    const getRiskColor = (risk) => {
        switch (risk) {
            case 'low': return '#10b981';
            case 'medium': return '#f59e0b';
            case 'high': return '#ef4444';
            default: return '#6b7280';
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const handleViewDetails = (claimId) => {
        navigate(`/claim-results/${claimId}`);
    };

    const handleNewClaim = () => {
        navigate('/');
    };

    const filteredClaims = claims.filter(claim =>
        claim.documentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        claim.formData?.cropType?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="claims-page">
            <div className="claims-container">
                <div className="claims-header">
                    <div className="header-content">
                        <h1 className="page-title">My Claims</h1>
                        <p className="page-subtitle">Track and manage your insurance claims</p>
                    </div>
                    <button onClick={handleNewClaim} className="btn-new-claim">
                        <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        New Claim
                    </button>
                </div>

                <div className="controls-section">
                    <div className="search-wrapper">
                        <svg className="search-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search by claim ID or crop type..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                    </div>

                    <div className="filter-tabs">
                        {[
                            { key: 'all', label: 'All Claims', count: claims.length },
                            { key: 'submitted', label: 'Submitted', count: claims.filter(c => c.status === 'submitted').length },
                            { key: 'processing', label: 'Processing', count: claims.filter(c => c.status === 'processing').length },
                            { key: 'approved', label: 'Approved', count: claims.filter(c => c.status === 'approved').length },
                            { key: 'payout-complete', label: 'Completed', count: claims.filter(c => c.status === 'payout-complete').length }
                        ].map(({ key, label, count }) => (
                            <button
                                key={key}
                                onClick={() => setFilter(key)}
                                className={`filter-tab ${filter === key ? 'active' : ''}`}
                            >
                                {label}
                                <span className="count-badge">{count}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="error-banner">
                        <p className="error-text">{error}</p>
                        <button onClick={fetchClaims} className="btn-retry">
                            Retry
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p className="loading-text">Loading your claims...</p>
                    </div>
                ) : filteredClaims.length > 0 ? (
                    <div className="claims-grid">
                        {filteredClaims.map((claim) => {
                            const statusConfig = getStatusConfig(claim.status);
                            return (
                                <div key={claim._id} className="claim-card">
                                    <div className="card-header">
                                        <div className="claim-id-section">
                                            <span className="claim-id">{claim.documentId}</span>
                                            <span className="insurance-name">{claim.insuranceId?.name}</span>
                                        </div>
                                        <span
                                            className="status-badge"
                                            style={{ backgroundColor: statusConfig.color }}
                                        >
                                            {statusConfig.label}
                                        </span>
                                    </div>

                                    <div className="card-body">
                                        <div className="detail-grid">
                                            <div className="detail-item">
                                                <svg className="detail-icon" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                                                </svg>
                                                <div className="detail-content">
                                                    <span className="detail-label">Crop Type</span>
                                                    <span className="detail-value">{claim.formData?.cropType}</span>
                                                </div>
                                            </div>

                                            <div className="detail-item">
                                                <svg className="detail-icon" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                                </svg>
                                                <div className="detail-content">
                                                    <span className="detail-label">Location</span>
                                                    <span className="detail-value">{claim.formData?.district}, {claim.formData?.state}</span>
                                                </div>
                                            </div>

                                            <div className="detail-item">
                                                <svg className="detail-icon" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                                                </svg>
                                                <div className="detail-content">
                                                    <span className="detail-label">Farm Area</span>
                                                    <span className="detail-value">{claim.formData?.farmArea} acres</span>
                                                </div>
                                            </div>

                                            <div className="detail-item">
                                                <svg className="detail-icon" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                                </svg>
                                                <div className="detail-content">
                                                    <span className="detail-label">Season</span>
                                                    <span className="detail-value">{claim.formData?.season}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="timeline-section">
                                            <div className="timeline-item">
                                                <span className="timeline-label">Submitted</span>
                                                <span className="timeline-date">{formatDate(claim.submittedAt)}</span>
                                            </div>
                                            {claim.approvedAt && (
                                                <div className="timeline-item success">
                                                    <span className="timeline-label">Approved</span>
                                                    <span className="timeline-date">{formatDate(claim.approvedAt)}</span>
                                                </div>
                                            )}
                                            {claim.rejectedAt && (
                                                <div className="timeline-item danger">
                                                    <span className="timeline-label">Rejected</span>
                                                    <span className="timeline-date">{formatDate(claim.rejectedAt)}</span>
                                                </div>
                                            )}
                                            {claim.payoutDate && (
                                                <div className="timeline-item success">
                                                    <span className="timeline-label">Payout</span>
                                                    <span className="timeline-date">{formatDate(claim.payoutDate)}</span>
                                                </div>
                                            )}
                                        </div>

                                        {claim.financial?.approvedAmount && (
                                            <div className="financial-card">
                                                <div className="financial-header">
                                                    <svg className="financial-icon" viewBox="0 0 20 20" fill="currentColor">
                                                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                                                    </svg>
                                                    <span className="financial-label">Approved Amount</span>
                                                </div>
                                                <span className="financial-amount">₹{claim.financial.approvedAmount.toLocaleString('en-IN')}</span>
                                                {claim.financial.paidAmount && (
                                                    <span className="payment-status">Payment processed</span>
                                                )}
                                            </div>
                                        )}

                                        {claim.processingResult && (
                                            <div className="processing-results">
                                                <div className="result-item">
                                                    <span className="result-label">Risk Assessment</span>
                                                    <span
                                                        className="risk-badge"
                                                        style={{
                                                            backgroundColor: `${getRiskColor(claim.processingResult.risk)}20`,
                                                            color: getRiskColor(claim.processingResult.risk)
                                                        }}
                                                    >
                                                        {claim.processingResult.risk?.toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="result-item">
                                                    <span className="result-label">Damage Assessment</span>
                                                    <div className="damage-indicator">
                                                        <div className="damage-bar">
                                                            <div
                                                                className="damage-fill"
                                                                style={{
                                                                    width: `${claim.processingResult.phases?.damageAssessment?.percentage || 0}%`,
                                                                    backgroundColor: getRiskColor(claim.processingResult.risk)
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="damage-percentage">
                                                            {(claim.processingResult.phases?.damageAssessment?.percentage || 0).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {claim.rejectionReason && (
                                            <div className="rejection-notice">
                                                <svg className="notice-icon" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                                <p className="rejection-text">{claim.rejectionReason}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="card-footer">
                                        <button
                                            onClick={() => handleViewDetails(claim.documentId)}
                                            className="btn-view-details"
                                        >
                                            View Details
                                            <svg className="btn-arrow" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                        {claim.status === 'payout-complete' && (
                                            <button className="btn-download">
                                                <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                                Receipt
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="empty-state">
                        <svg className="empty-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                        <h3 className="empty-title">No claims found</h3>
                        <p className="empty-description">
                            {searchTerm
                                ? `No results found for "${searchTerm}"`
                                : filter === 'all'
                                    ? "You haven't submitted any claims yet"
                                    : `No ${filter} claims found`
                            }
                        </p>
                        {!searchTerm && (
                            <button onClick={handleNewClaim} className="btn-empty-action">
                                Create Your First Claim
                            </button>
                        )}
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="pagination">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="pagination-btn"
                        >
                            <svg className="pagination-icon" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Previous
                        </button>
                        <span className="pagination-info">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="pagination-btn"
                        >
                            Next
                            <svg className="pagination-icon" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClaimsList;
