// --- 🛡️ 企業級架構：指向專屬 Worker 中介層，前端不帶 Token ---
const WORKER_BASE_URL = 'https://pmo-ai-ticket.sd-574.workers.dev';
const OP_UPLOAD_WEBHOOK = `${WORKER_BASE_URL}/api/upload`;
const SALES_QUERY_WEBHOOK = `${WORKER_BASE_URL}/api/query`;
const DOWNLOAD_WEBHOOK = `${WORKER_BASE_URL}/api/download`;

// --- 初始化與 DOM 節點 ---
lucide.createIcons();

const AIRLINE_RULES = {
    'BR': { name: '長榮航空', color: 'text-green-600' },
    'CI': { name: '中華航空', color: 'text-blue-600' },
    'JX': { name: '星宇航空', color: 'text-rose-500' },
    'EK': { name: '阿聯酋航空', color: 'text-red-600' },
    'TK': { name: '土耳其航空', color: 'text-orange-500' }
};

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const opTourInput = document.getElementById('opTourCode');
const airlineTag = document.getElementById('airlineTag');
const startOpBtn = document.getElementById('startOpProcess');
const resultsCard = document.getElementById('resultsCard');
const resultTableBody = document.getElementById('resultTableBody');
const toast = document.getElementById('toast');
const fileCountBadge = document.getElementById('fileCountBadge');
const batchDownloadBtn = document.getElementById('batchDownloadBtn');

let selectedFiles = [];
let currentQueryResults = [];
let currentQueryTourCode = '';
let pdfCache = {}; 
let matchedAirlineName = ''; 

// --- 安全 DOM 工具函式 ---
function cloneTemplate(templateId) {
    const template = document.getElementById(templateId);
    return template.content.cloneNode(true);
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function showToast(msg) { 
    toast.textContent = msg; 
    toast.classList.replace('opacity-0', 'opacity-100'); 
    setTimeout(() => toast.classList.replace('opacity-100', 'opacity-0'), 2000); 
}

function copyToClipboard(text) { 
    if (!text || text === 'N/A' || text === '---') return; 
    const el = document.createElement('textarea'); 
    el.value = text; 
    document.body.appendChild(el); 
    el.select(); 
    document.execCommand('copy'); 
    document.body.removeChild(el); 
    showToast(`已複製: ${text}`); 
}

// 安全替換 innerHTML 的狀態渲染
function showStatus(type, title, desc) {
    const overlay = document.getElementById('statusOverlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    document.getElementById('statusTitle').textContent = title;
    document.getElementById('statusDesc').textContent = desc;
    
    const btn = document.getElementById('statusBtn');
    const container = document.getElementById('statusIconContainer');
    const iconEl = document.getElementById('statusIconElement');

    if (type === 'processing') {
        container.className = "w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center bg-indigo-50 text-indigo-500 animate-pulse";
        iconEl.setAttribute('data-lucide', 'loader-2');
        iconEl.className = "w-10 h-10 animate-spin";
        btn.classList.add('hidden');
    } else if (type === 'success') {
        container.className = "w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center bg-green-50 text-green-600";
        iconEl.setAttribute('data-lucide', 'check-circle-2');
        iconEl.className = "w-10 h-10";
        btn.classList.remove('hidden');
    } else {
        container.className = "w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center bg-red-50 text-red-500";
        iconEl.setAttribute('data-lucide', 'alert-triangle');
        iconEl.className = "w-10 h-10";
        btn.classList.remove('hidden');
    }
    lucide.createIcons();
}

document.getElementById('statusBtn').addEventListener('click', () => {
    const overlay = document.getElementById('statusOverlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
});

document.getElementById('reloadBtn').addEventListener('click', () => {
    window.location.reload();
});

// --- 航司與檔案上傳邏輯 ---
opTourInput.addEventListener('input', (e) => {
    const val = e.target.value.toUpperCase();
    let found = false;
    for (const [code, rule] of Object.entries(AIRLINE_RULES)) {
        if (val.includes(code)) {
            airlineTag.textContent = rule.name;
            airlineTag.className = `mt-2 text-[10px] font-black ${rule.color} flex items-center gap-1 h-3`;
            matchedAirlineName = rule.name; 
            found = true; break;
        }
    }
    if (!found) {
        airlineTag.textContent = '待輸入團號自動判斷航司';
        airlineTag.className = 'mt-2 text-[10px] font-bold text-slate-400 flex items-center gap-1 h-3';
        matchedAirlineName = '';
    }
});

dropZone.addEventListener('click', (e) => {
    if (!e.target.closest('.remove-file-btn')) fileInput.click();
});
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });

function handleFiles(files) {
    const incomingFiles = Array.from(files);
    const validPdfFiles = [];
    let hasInvalidFormat = false;

    incomingFiles.forEach(f => {
        if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
            validPdfFiles.push(f);
        } else { hasInvalidFormat = true; }
    });

    if (hasInvalidFormat) alert('請確認上傳的檔案格式，系統僅支援 PDF 檔。');
    if (validPdfFiles.length > 0) {
        selectedFiles = [...selectedFiles, ...validPdfFiles];
        renderFileList();
    }
}

// 模板化重構：100% 防止檔名 XSS
function renderFileList() {
    fileList.textContent = '';
    
    if (selectedFiles.length > 0) {
        document.getElementById('idleState').classList.add('hidden');
        fileList.classList.remove('hidden');
        
        fileCountBadge.textContent = `共 ${selectedFiles.length} 個檔案`;
        fileCountBadge.classList.remove('hidden');

        selectedFiles.forEach((f, i) => {
            const node = cloneTemplate('fileItemTemplate');
            node.querySelector('.tpl-file-name').textContent = f.name;
            node.querySelector('.remove-file-btn').setAttribute('data-index', i);
            fileList.appendChild(node);
        });
        lucide.createIcons();
    } else {
        document.getElementById('idleState').classList.remove('hidden');
        fileList.classList.add('hidden');
        fileCountBadge.classList.add('hidden');
    }
}

// 事件代理刪除檔案
fileList.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.remove-file-btn');
    if (removeBtn) {
        e.stopPropagation();
        const idx = parseInt(removeBtn.getAttribute('data-index'), 10);
        selectedFiles.splice(idx, 1);
        renderFileList();
    }
});

// --- Flow 1: OP 端上傳 (保留延遲與分流邏輯) ---
startOpBtn.addEventListener('click', async () => {
    const tourCode = opTourInput.value.toUpperCase().trim();
    const ticketTypeRadio = document.querySelector('input[name="ticketType"]:checked');

    if (!tourCode || selectedFiles.length === 0) return alert('請輸入團號並選擇 PDF 檔案');
    if (!ticketTypeRadio) return alert('請選擇票根類型（團體 或 FIT）');

    const ticketType = ticketTypeRadio.value; 
    const isCIorJX = tourCode.includes('CI') || tourCode.includes('JX');

    try {
        if (isCIorJX && ticketType === 'Group') {
            showStatus('processing', '背景歸檔與解析啟動中', `正在將 [團體票] 合併並送往雲端，後續將由 AI 自動路由解析...`);

            const mergedPdf = await PDFLib.PDFDocument.create();
            for (const f of selectedFiles) {
                const pdf = await PDFLib.PDFDocument.load(await f.arrayBuffer());
                const [firstPage] = await mergedPdf.copyPages(pdf, [0]);
                mergedPdf.addPage(firstPage);
            }
            const finalBlob = new Blob([await mergedPdf.save()], { type: 'application/pdf' });

            const formData = new FormData();
            formData.append('data', finalBlob, `${tourCode}_${ticketType}.pdf`);
            formData.append('TourCode', tourCode);
            formData.append('TicketType', ticketType); 
            formData.append('Airline', matchedAirlineName || '未判斷航司'); 
            formData.append('Type', "Upload");
            formData.append('empId', window.getEmpId());
            formData.append('Time', window.getClientTime());

            const res = await fetch(OP_UPLOAD_WEBHOOK, { 
                method: 'POST', 
                body: formData // Worker 會自動注入 Token
            });
            if (!res.ok) throw new Error('上傳觸發失敗');
            
            showStatus('success', '任務已提交', `檔案已上傳！AI 正在背景依照 ${ticketType} 格式進行精準解析。業務人員可於2分鐘後進行查詢。`);

        } else {
            const totalFiles = selectedFiles.length;
            const batchTimestamp = Date.now();

            for (let i = 0; i < totalFiles; i++) {
                showStatus('processing', `批次上傳中 (${i + 1}/${totalFiles})`, `正在上傳第 ${i + 1}/${totalFiles} 份 ${ticketType} 票根...\n(每個檔案將緩衝30秒進行上傳 AI 解析。)`);

                const singleFile = selectedFiles[i];
                const formData = new FormData();
                const uniqueFileName = `${tourCode}_${ticketType}_part${i + 1}_${batchTimestamp}.pdf`;

                formData.append('data', singleFile, uniqueFileName);
                formData.append('TourCode', tourCode);
                formData.append('TicketType', ticketType); 
                formData.append('Airline', matchedAirlineName || '未判斷航司'); 
                formData.append('Type', "Upload");
                formData.append('empId', window.getEmpId());
                formData.append('Time', window.getClientTime());

                const res = await fetch(OP_UPLOAD_WEBHOOK, { 
                    method: 'POST', 
                    body: formData 
                });
                
                if (!res.ok) throw new Error(`第 ${i + 1} 份檔案上傳失敗`);

                if (i < totalFiles - 1) {
                    await delay(45000); 
                }
            }
            showStatus('success', '全數上傳完成', `全數 ${totalFiles} 份檔案已上傳完畢！\nAI 已完成背景解析，業務人員可於2分鐘後進行查詢。`);
        }
        
        selectedFiles = []; renderFileList(); opTourInput.value = '';
        ticketTypeRadio.checked = false; 
        
    } catch (err) {
        showStatus('error', '處理異常', err.message);
    }
});

// --- Flow 2: Sales 端查詢 ---
document.getElementById('startSalesProcess').addEventListener('click', async () => {
    const tourCode = document.getElementById('salesTourCode').value.toUpperCase().trim();
    const names = document.getElementById('salesPassengerName').value.toUpperCase().trim();
    
    if (!tourCode || !names) return alert('請務必輸入「查詢團號」與「旅客英文姓名」。');

    resultsCard.classList.remove('hidden');
    resultsCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // 安全繪製骨架屏
    resultTableBody.textContent = '';
    for(let i=0; i<3; i++) {
        resultTableBody.appendChild(cloneTemplate('skeletonRowTemplate'));
    }

    try {
        const res = await fetch(SALES_QUERY_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tourCode, 
                passengerNames: names, 
                type: "Query", 
                empId: window.getEmpId(),
                Time: window.getClientTime() 
            })
        });

        const textData = await res.text();
        if (!textData) throw new Error('此團號尚未開票完成，請稍後再進行查詢');

        let data;
        try { data = JSON.parse(textData); } catch (e) { throw new Error('此團號尚未開票完成，請稍後再進行查詢'); }

        if (!res.ok) throw new Error('檢索失敗，請稍後再試。');
        if (data.error === 'TOUR_NOT_FOUND') throw new Error('此團號尚未開票完成，請稍後再進行查詢');
        if (data.error === 'PASSENGER_NOT_FOUND') throw new Error('查無匹配的旅客資料，請確認姓名拼字是否正確。');
        
        let resultsArr = Array.isArray(data) ? data : (data.output || data.results || [data]);
        const checkTicket = resultsArr[0]?.ticketNumber || resultsArr[0]?.TicketNumber;
        if (resultsArr.length === 0 || !checkTicket) throw new Error('此團號尚未開票完成，請稍後再進行查詢');

        renderResults(resultsArr, tourCode);
    } catch (err) {
        resultTableBody.textContent = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.className = "px-10 py-10 text-center text-rose-500 font-bold bg-rose-50/30";
        
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'alert-circle');
        icon.className = "w-8 h-8 inline-block mb-2 text-rose-400 block mx-auto";
        
        const span = document.createElement('span');
        span.className = "text-base tracking-wide";
        span.textContent = err.message;
        
        td.appendChild(icon);
        td.appendChild(span);
        tr.appendChild(td);
        resultTableBody.appendChild(tr);
        lucide.createIcons();
    }
});

// 重構渲染表格邏輯
function renderResults(results, tourCode) {
    currentQueryResults = results;
    currentQueryTourCode = tourCode;
    
    if(batchDownloadBtn) {
        const validForBatch = results.filter(r => {
            const pageIdx = r.pageIndex || r.PageIndex || '';
            const airline = r.airline || r.Airline || '';
            const tType = r.ticketType || r.TicketType || 'Group';
            const isBrGroup = (airline.includes('EVA Air') || airline.includes('長榮') || airline.includes('BR')) && tType === 'Group';
            const isTkGroup = (airline.includes('Turkish Airlines') || airline.includes('土耳其') || airline.includes('TK')) && tType === 'Group';
            return pageIdx && !isBrGroup && !isTkGroup;
        });
        
        const canBatchDownload = validForBatch.length > 0;
        batchDownloadBtn.classList.toggle('hidden', !canBatchDownload);
        batchDownloadBtn.classList.toggle('flex', canBatchDownload);
    }

    resultTableBody.textContent = '';

    results.forEach(row => {
        const rTour = row.tourCode || row.TourCode || tourCode;
        const rName = row.name || row.Name || 'Unknown';
        const rTicket = row.ticketNumber || row.TicketNumber || 'N/A';
        const rPnr = row.pnr || row.PNR || '---';
        const rAirline = row.airline || row.Airline || 'N/A';
        const rPageIndex = row.pageIndex || row.PageIndex || '';
        const rType = row.ticketType || row.TicketType || 'Group';

        const trNode = cloneTemplate('resultRowTemplate');
        trNode.querySelector('.tpl-tour').textContent = rTour;
        trNode.querySelector('.tpl-name').textContent = rName;
        trNode.querySelector('.tpl-ticket').textContent = rTicket;
        trNode.querySelector('.tpl-pnr').textContent = rPnr;
        trNode.querySelector('.tpl-airline').textContent = rAirline;

        trNode.querySelectorAll('.copy-target')[0].setAttribute('data-copy', rTicket);
        trNode.querySelectorAll('.copy-target')[1].setAttribute('data-copy', rPnr);

        const downloadContainer = trNode.querySelector('.tpl-download-container');
        const isBrGroup = (rAirline.includes('EVA Air') || rAirline.includes('長榮') || rAirline.includes('BR')) && rType === 'Group';
        const isTkGroup = (rAirline.includes('Turkish Airlines') || rAirline.includes('土耳其') || rAirline.includes('TK')) && rType === 'Group';

        if (rPageIndex && !isBrGroup && !isTkGroup) {
            const btn = document.createElement('button');
            btn.className = "download-single-btn whitespace-nowrap group flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white rounded-lg transition-all text-[11px] font-black mx-auto shadow-sm";
            btn.setAttribute('data-tour', rTour);
            btn.setAttribute('data-name', rName);
            btn.setAttribute('data-page', rPageIndex);
            btn.setAttribute('data-type', rType);
            btn.setAttribute('data-pnr', rPnr);
            
            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', 'download');
            icon.className = "w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform pointer-events-none";
            
            btn.appendChild(icon);
            btn.appendChild(document.createTextNode(' 下載 PDF'));
            downloadContainer.appendChild(btn);
        } else {
            const span = document.createElement('span');
            span.className = "inline-block whitespace-nowrap text-[10px] text-slate-400 font-bold tracking-widest bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200";
            span.textContent = "無PDF";
            downloadContainer.appendChild(span);
        }

        resultTableBody.appendChild(trNode);
    });
    lucide.createIcons();
}

// 統一的事件代理：複製與單檔下載
resultTableBody.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-target');
    if (copyBtn) copyToClipboard(copyBtn.getAttribute('data-copy'));

    const downloadBtn = e.target.closest('.download-single-btn');
    if (downloadBtn) {
        const tCode = downloadBtn.getAttribute('data-tour');
        const pName = downloadBtn.getAttribute('data-name');
        const pIdx = downloadBtn.getAttribute('data-page');
        const tType = downloadBtn.getAttribute('data-type');
        const pnr = downloadBtn.getAttribute('data-pnr');
        downloadTicket(tCode, pName, pIdx, tType, pnr);
    }
});

// 單筆下載邏輯
async function downloadTicket(tourCode, passengerName, pageIndex, ticketType, pnr) {
    showStatus('processing', '機票擷取中', `正在拆解 ${passengerName} 的專屬機票，請稍候...`);
    try {
        const cacheKey = `${tourCode}_${ticketType}_${pnr}`;
        const payload = { 
            tourCode, passengerName: passengerName, passengerNames: "", type: "Download", 
            empId: window.getEmpId(), ticketType: ticketType, PNR: pnr, Time: window.getClientTime()
        };

        let mergedPdfBytes;
        if (pdfCache[cacheKey]) {
            mergedPdfBytes = pdfCache[cacheKey];
            fetch(DOWNLOAD_WEBHOOK, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            }).catch(e => console.log('Log sending failed', e));
        } else {
            const res = await fetch(DOWNLOAD_WEBHOOK, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('無法取得機票合併檔，請確認伺服器連線');
            mergedPdfBytes = await res.arrayBuffer();
            pdfCache[cacheKey] = mergedPdfBytes; 
        }

        showStatus('processing', '處理中', `正在執行擷取PDF...`);
        
        let pdfDoc;
        try {
            const bufferCopy = mergedPdfBytes.slice(0);
            pdfDoc = await PDFLib.PDFDocument.load(bufferCopy);
        } catch (e) {
            delete pdfCache[cacheKey];
            throw new Error('解析 PDF 失敗！請確認 n8n 下載節點回傳的是單一 PDF 檔案，而不是 JSON。');
        }

        const totalPages = pdfDoc.getPageCount();
        const targetPageIndex = parseInt(pageIndex) - 1;
        
        if (isNaN(targetPageIndex) || targetPageIndex < 0 || targetPageIndex >= totalPages) {
            throw new Error(`裁切失敗：需要第 ${targetPageIndex + 1} 頁，但雲端檔案總共只有 ${totalPages} 頁。這代表 n8n 撈錯了檔案。`);
        }

        const newPdf = await PDFLib.PDFDocument.create();
        const [copiedPage] = await newPdf.copyPages(pdfDoc, [targetPageIndex]);
        newPdf.addPage(copiedPage);
        const finalPdfBytes = await newPdf.save();

        const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${tourCode}_${passengerName.replace(/\//g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showStatus('success', '下載成功', `機票已為您打包下載！\n⚠️ 下載後請開啟PDF核對EBS後再提供給旅客。`);
        setTimeout(() => document.getElementById('statusBtn').click(), 3000); 
    } catch (err) {
        showStatus('error', '下載失敗', err.message);
    }
}

// 批次打包 ZIP 下載邏輯
if (batchDownloadBtn) {
    batchDownloadBtn.addEventListener('click', async () => {
        if (currentQueryResults.length === 0) return;
        
        const validPassengers = currentQueryResults.filter(r => {
            const pageIdx = r.pageIndex || r.PageIndex || '';
            const airline = r.airline || r.Airline || '';
            const tType = r.ticketType || r.TicketType || 'Group';
            const isBrGroup = (airline.includes('EVA Air') || airline.includes('長榮') || airline.includes('BR')) && tType === 'Group';
            const isTkGroup = (airline.includes('Turkish Airlines') || airline.includes('土耳其') || airline.includes('TK')) && tType === 'Group';
            return pageIdx && !isBrGroup && !isTkGroup;
        });
        
        if (validPassengers.length === 0) return;

        showStatus('processing', '機票打包中', `正在擷取並為 ${validPassengers.length} 位旅客獨立切檔，請稍候...`);
        try {
            const tourCode = currentQueryTourCode;
            const zip = new JSZip();
            const folderName = `${tourCode}_批次機票`;
            const ticketFolder = zip.folder(folderName);

            const passengersByGroup = {};
            for (const p of validPassengers) {
                const pnr = p.pnr || p.PNR || 'UNKNOWN';
                const tType = p.ticketType || p.TicketType || 'Group';
                const key = `${tType}_${pnr}`; 
                
                if (!passengersByGroup[key]) passengersByGroup[key] = { tType, pnr, passengers: [] };
                passengersByGroup[key].passengers.push(p);
            }

            for (const [key, group] of Object.entries(passengersByGroup)) {
                const { tType, pnr, passengers: groupPassengers } = group;
                let mergedPdfBytes;
                const cacheKey = `${tourCode}_${tType}_${pnr}`;
                
                const joinedNames = groupPassengers.map(p => p.name || p.Name || 'Unknown').join(',');
                const payload = { 
                    tourCode, passengerName: "", passengerNames: joinedNames, type: "Download", 
                    empId: window.getEmpId(), ticketType: tType, PNR: pnr, Time: window.getClientTime() 
                };

                if (pdfCache[cacheKey]) {
                    mergedPdfBytes = pdfCache[cacheKey];
                    fetch(DOWNLOAD_WEBHOOK, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                    }).catch(e => console.log('Log sending failed', e));
                } else {
                    const res = await fetch(DOWNLOAD_WEBHOOK, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error('無法取得票根合併檔，請確認伺服器連線');
                    mergedPdfBytes = await res.arrayBuffer();
                    pdfCache[cacheKey] = mergedPdfBytes; 
                }

                showStatus('processing', '打包壓縮中', `正在處理多位旅客的票根，請稍候...`);

                let safePdfDoc;
                try {
                    const bufferCopy = mergedPdfBytes.slice(0);
                    safePdfDoc = await PDFLib.PDFDocument.load(bufferCopy);
                } catch (e) {
                    delete pdfCache[cacheKey];
                    throw new Error(`解析 PNR: ${pnr} 的 PDF 失敗！請確認 n8n 下載節點回傳正確檔案。`);
                }

                const totalPages = safePdfDoc.getPageCount();

                for (const p of groupPassengers) {
                    const targetIdx = parseInt(p.pageIndex || p.PageIndex) - 1; 
                    
                    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= totalPages) {
                        throw new Error(`批次裁切失敗：旅客 ${p.name || 'Unknown'} 需要第 ${targetIdx + 1} 頁，但 PNR [${pnr}] 檔案只有 ${totalPages} 頁。`);
                    }

                    const newPdf = await PDFLib.PDFDocument.create();
                    const [copiedPage] = await newPdf.copyPages(safePdfDoc, [targetIdx]);
                    newPdf.addPage(copiedPage);
                    
                    const singlePdfBytes = await newPdf.save();
                    const safeName = (p.name || p.Name || 'Unknown').replace(/\//g, '_');
                    ticketFolder.file(`${tourCode}_${safeName}.pdf`, singlePdfBytes);
                }
            }

            const zipContent = await zip.generateAsync({ type: 'blob' });
            const url = window.URL.createObjectURL(zipContent);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `${folderName}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showStatus('success', '打包下載成功', `已為您將 ${validPassengers.length} 份機票打包完成！\n⚠️ 下載後請開啟PDF核對EBS後再提供給旅客。`);
            setTimeout(() => document.getElementById('statusBtn').click(), 3000); 
        } catch (err) {
            showStatus('error', '下載失敗', err.message);
        }
    });
}

// --- 員工編號與時間 Auth ---
const EMP_SESSION_KEY = 'colatour_temp_emp_id';
const empAuthOverlay = document.getElementById('empAuthOverlay');
const empIdInput = document.getElementById('empIdInput');
const verifyEmpIdBtn = document.getElementById('verifyEmpIdBtn');
const empIdError = document.getElementById('empIdError');
const mainAppContent = document.getElementById('mainAppContent');

function initAuth() {
    if (sessionStorage.getItem(EMP_SESSION_KEY)) {
        empAuthOverlay.classList.add('hidden');
        empAuthOverlay.classList.remove('flex');
        if(mainAppContent) mainAppContent.classList.remove('opacity-30', 'pointer-events-none');
    } else {
        empAuthOverlay.classList.remove('hidden');
        empAuthOverlay.classList.add('flex'); 
        if(mainAppContent) mainAppContent.classList.add('opacity-30', 'pointer-events-none');
        setTimeout(() => empIdInput.focus(), 100);
    }
}

verifyEmpIdBtn.addEventListener('click', () => {
    const val = empIdInput.value.trim();
    if (!/^\d{4}$/.test(val)) {
        empIdError.classList.remove('hidden');
        empIdError.classList.add('flex');
        empIdInput.classList.add('border-rose-400', 'focus:ring-rose-100');
        return;
    }
    empIdError.classList.add('hidden');
    empIdError.classList.remove('flex');
    empIdInput.classList.remove('border-rose-400', 'focus:ring-rose-100');
    sessionStorage.setItem(EMP_SESSION_KEY, val);
    empAuthOverlay.classList.add('hidden');
    empAuthOverlay.classList.remove('flex');
    if(mainAppContent) mainAppContent.classList.remove('opacity-30', 'pointer-events-none');
});

empIdInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') verifyEmpIdBtn.click(); });
window.getEmpId = () => sessionStorage.getItem(EMP_SESSION_KEY) || 'UNKNOWN';
window.getClientTime = () => Date.now(); 

initAuth();