import React, { useState, useEffect } from "react";
import axios from "axios";
import { UploadCloud, RefreshCw, Search } from "lucide-react";
import "./EgxDashboard.css";

// Assuming backend runs on 5000 in dev
const API_BASE = "http://localhost:5000";

const EgxDashboard = () => {
  const [activeTab, setActiveTab] = useState("scraping");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [activities, setActivities] = useState([]);
  const [latestData, setLatestData] = useState([]);

  // Search state
  const [searchSymbol, setSearchSymbol] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [historyResult, setHistoryResult] = useState(null);

  // 1. Scraping Action
  const handleScrape = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await axios.get(`${API_BASE}/sync-activities`);
      if (res.data.success) {
        setMessage(`تم التحديث بنجاح! تم جلب ${res.data.totalActivities || 0} نشاط متخصص.`);
      }
    } catch (err) {
      setMessage("حدث خطأ أثناء جلب البيانات.");
    }
    setLoading(false);
  };

  // 2. Upload Excel
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    setMessage("");
    try {
      const res = await axios.post(`${API_BASE}/upload-excel`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.success) {
        setMessage(`تم رفع ملف اليوم بنجاح! عدد الشركات المرفوعة: ${res.data.uploadedRows}`);
        fetchLatest();
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.message) {
        setMessage(err.response.data.message); // Displays the "already uploaded today" message
      } else {
        setMessage("حدث خطأ أثناء رفع الملف.");
      }
    }
    setLoading(false);
  };

  // 3. Fetch Activities
  const fetchActivities = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/activities`);
      setActivities(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // 4. Fetch Latest
  const fetchLatest = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/latest`);
      setLatestData(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // 5. Fetch History
  const handleHistorySearch = async () => {
    if (!searchSymbol) {
      setMessage("يرجى إدخال رمز الشركة أولاً.");
      return;
    }

    setLoading(true);
    setMessage("");
    setHistoryResult(null);

    try {
      const res = await axios.get(`${API_BASE}/company/${searchSymbol}/history`);
      let data = res.data;

      // Filter by date range if provided
      if (startDate && endDate) {
        data = data.filter((item) => item["التاريخ"] >= startDate && item["التاريخ"] <= endDate);
      } else if (startDate) {
        data = data.filter((item) => item["التاريخ"] >= startDate);
      } else if (endDate) {
        data = data.filter((item) => item["التاريخ"] <= endDate);
      }

      setHistoryResult(data);
    } catch (err) {
      setMessage("حدث خطأ أثناء البحث في السجل.");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === "activities") fetchActivities();
    if (activeTab === "latest") fetchLatest();
  }, [activeTab]);

  const renderTable = (dataArray) => {
    if (!dataArray || dataArray.length === 0) return <p>لا توجد بيانات لعرضها.</p>;
    const keys = Object.keys(dataArray[0]).filter(k => k !== "uploadId" && k !== "uploadedAt");

    return (
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              {keys.map((k) => (
                <th key={k}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataArray.map((row, idx) => (
              <tr key={idx}>
                {keys.map((k) => (
                  <td key={k}>{row[k]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Group current activities by Specialized Activity
  const renderGroupedActivities = () => {
    if (!activities || activities.length === 0) return <p>لا توجد بيانات حالية.</p>;
    
    // Group logic
    const grouped = activities.reduce((acc, current) => {
      const act = current.Activity || "غير محدد";
      if (!acc[act]) acc[act] = [];
      acc[act].push(current);
      return acc;
    }, {});

    return Object.keys(grouped).map((activityName, index) => (
      <div key={index} className="activity-group">
        <h4 className="activity-title">{activityName}</h4>
        <div className="table-wrapper mb-2">
          <table>
            <thead>
              <tr>
                <th>رمز الشركة (SymbolId)</th>
                <th>اسم الشركة (إن وجد)</th>
                <th>تاريخ التحديث</th>
              </tr>
            </thead>
            <tbody>
              {grouped[activityName].map((co, idx) => (
                <tr key={idx}>
                  <td>{co.Symbolid}</td>
                  <td>{co.CompanyName || "غير متوفر حتى رفع الإكسيل"}</td>
                  <td>{new Date(co.UpdatedAt).toLocaleString('ar-EG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ));
  };

  return (
    <div className="egx-dashboard" dir="rtl">
      <div className="dashboard-header">
        <h1>مركز بيانات البورصة</h1>
        <p>إدارة وتحليل بيانات البورصة المصرية</p>
      </div>

      <div className="tabs">
        <button className={activeTab === "scraping" ? "active" : ""} onClick={() => setActiveTab("scraping")}>لوحة التحكم</button>
        <button className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}>سجل الشركات</button>
        <button className={activeTab === "latest" ? "active" : ""} onClick={() => setActiveTab("latest")}>أحدث البيانات</button>
        <button className={activeTab === "activities" ? "active" : ""} onClick={() => setActiveTab("activities")}>الأنشطة المتخصصة</button>
      </div>

      <div className="dashboard-content">
        {loading && <div className="loader-bar">جاري التحميل...</div>}
        {message && <div className="message-alert">{message}</div>}

        {activeTab === "scraping" && (
          <div className="panel grid-panel">
            <div className="card scrape-card">
              <h3>تحديث الأنشطة المتخصصة</h3>
              <p>جلب الأنشطة المتخصصة اليومية مباشرة من موقع البورصة.</p>
              <button className="btn-primary btn-red" onClick={handleScrape} disabled={loading}>
                <RefreshCw size={18} />
                تحديث الأنشطة الآن
              </button>
            </div>

            <div className="card upload-card">
              <h3>رفع ملف الإكسيل اليومي</h3>
              <p>قم برفع ملف أسعار اليوم لدمجه مع الأنشطة المتخصصة.</p>
              <label className="btn-primary btn-green file-label">
                <UploadCloud size={18} />
                اختر ملف إكسيل
                <input type="file" accept=".xlsx, .xls" onChange={handleUpload} disabled={loading} hidden />
              </label>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="panel history-panel">
            <div className="search-bar card">
              <input 
                type="text" 
                placeholder="رمز الشركة (مثال: EGS02021C011)" 
                value={searchSymbol} 
                onChange={(e) => setSearchSymbol(e.target.value)}
              />
              <input 
                type="date" 
                title="من تاريخ"
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
              />
              <input 
                type="date" 
                title="إلى تاريخ"
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
              />
              <button className="btn-primary btn-grey" onClick={handleHistorySearch} disabled={loading}>
                <Search size={18} />
                ابحث في السجل
              </button>
            </div>

            <div className="history-results card">
              {historyResult ? renderTable(historyResult) : <p className="text-muted">أدخل رمز الشركة واختر فترة زمنية لعرض السجل.</p>}
            </div>
          </div>
        )}

        {activeTab === "latest" && (
          <div className="panel data-panel card">
            <h3>أحدث أسعار مرفوعة اليوم</h3>
            {renderTable(latestData)}
          </div>
        )}

        {activeTab === "activities" && (
          <div className="panel data-panel card">
            <h3>الشركات مقسمة حسب النشاط المتخصص الحالي</h3>
            {renderGroupedActivities()}
          </div>
        )}
      </div>
    </div>
  );
};

export default EgxDashboard;
