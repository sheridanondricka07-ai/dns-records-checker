// State Management
let allResults = [];
let isProcessing = false;
const CHUNK_SIZE = 25; // Optimized for Vercel timeouts

// DOM Elements
const domainInput = document.getElementById('domain-input');
const checkSPF = document.getElementById('check-spf');
const checkMX = document.getElementById('check-mx');
const checkBtn = document.getElementById('check-btn');
const resultsBody = document.getElementById('results-body');
const emptyState = document.getElementById('empty-state');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const progressContainer = document.getElementById('progress-container');
const statsContainer = document.getElementById('stats-container');
const totalCheckedEl = document.getElementById('total-checked');
const totalOkEl = document.getElementById('total-ok');
const statusBadge = document.getElementById('status-badge');
const copyBtn = document.getElementById('copy-btn');
const downloadBtn = document.getElementById('download-btn');
const filterContainer = document.getElementById('filter-container');

// Initialize
function init() {
    setupEventListeners();
}

function setupEventListeners() {
    checkBtn.addEventListener('click', startCheck);
    copyBtn.addEventListener('click', copyResultsToClipboard);
    downloadBtn.addEventListener('click', downloadCSV);
    
    // Filtering
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active', 'bg-white/10', 'text-white'));
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.add('bg-black/20', 'text-slate-400'));
            
            chip.classList.add('active', 'bg-white/10', 'text-white');
            chip.classList.remove('bg-black/20', 'text-slate-400');
            
            applyFilter(chip.dataset.filter);
        });
    });
}

async function startCheck() {
    if (isProcessing) return;
    
    const rawInput = domainInput.value.trim();
    if (!rawInput) {
        showToast('Please enter at least one domain', 'error');
        return;
    }

    const domains = [...new Set(
        rawInput.split(/[\n,]/)
            .map(d => d.trim().toLowerCase())
            .filter(d => d.length > 0 && d.includes('.'))
    )];

    if (domains.length === 0) {
        showToast('No valid domains found', 'error');
        return;
    }

    // Reset UI
    allResults = [];
    resultsBody.innerHTML = '';
    isProcessing = true;
    checkBtn.disabled = true;
    checkBtn.innerHTML = '<span>Processing...</span><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
    statusBadge.classList.remove('hidden');
    progressContainer.classList.remove('hidden');
    statsContainer.classList.remove('hidden');
    filterContainer.classList.remove('hidden');
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
    lucide.createIcons();

    // Chunk domains
    const chunks = [];
    for (let i = 0; i < domains.length; i += CHUNK_SIZE) {
        chunks.push(domains.slice(i, i + CHUNK_SIZE));
    }

    let completed = 0;
    updateStats(0, 0);

    for (const chunk of chunks) {
        try {
            const response = await fetch('/api/check-records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domains: chunk,
                    checkSPF: checkSPF.checked,
                    checkMX: checkMX.checked
                })
            });

            if (!response.ok) throw new Error('API Error');

            const results = await response.json();
            allResults.push(...results);
            
            results.forEach(result => appendResultRow(result));
            
            completed += chunk.length;
            const percent = Math.round((completed / domains.length) * 100);
            progressBar.style.width = `${percent}%`;
            progressPercent.innerText = `${percent}%`;
            
            updateStats(allResults.length, allResults.filter(r => r.status === 'ok').length);
            
        } catch (error) {
            console.error('Batch error:', error);
            showToast('A batch encountered an error', 'error');
        }
    }

    // Wrap up
    isProcessing = false;
    checkBtn.disabled = false;
    checkBtn.innerHTML = '<span>Check Records</span><i data-lucide="zap" class="w-4 h-4"></i>';
    statusBadge.classList.add('hidden');
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
    lucide.createIcons();
    showToast(`Checked ${allResults.length} domains successfully`, 'success');
}

function appendResultRow(result) {
    const row = document.createElement('tr');
    row.className = 'hover:bg-white/[0.02] transition-colors group animate-in fade-in duration-500';
    row.dataset.domain = result.domain;
    row.dataset.hasSpf = result.spf && result.spf !== 'Not Found' && result.spf !== 'Error' ? 'true' : 'false';
    row.dataset.hasMx = result.mx && result.mx !== 'Not Found' && result.mx !== 'Error' ? 'true' : 'false';
    row.dataset.status = result.status;

    const spfDisplay = formatSpfRecord(result.spf, result.domain) || '-';
    const mxDisplay = result.mx || '-';
    
    const spfClass = result.spf === 'Not Found' ? 'text-slate-500' : (result.spf === 'Error' ? 'text-red-400' : 'text-blue-300 font-mono text-[11px]');
    const mxClass = result.mx === 'Not Found' ? 'text-slate-500' : (result.mx === 'Error' ? 'text-red-400' : 'text-indigo-300 font-mono text-[11px]');

    row.innerHTML = `
        <td class="px-6 py-4">
            <div class="flex flex-col">
                <span class="font-medium text-white">${result.domain}</span>
                <span class="text-[10px] text-slate-500">${result.responseTime}ms</span>
            </div>
        </td>
        <td class="px-6 py-4 max-w-md">
            <div class="break-words ${spfClass}">${spfDisplay}</div>
            <div class="mechanism-details hidden mt-3 flex flex-wrap gap-2 animate-in slide-in-from-top-2 duration-300"></div>
        </td>
        <td class="px-6 py-4 max-w-md">
            <div class="break-all ${mxClass}">${mxDisplay}</div>
        </td>
        <td class="px-6 py-4">
            ${getStatusBadge(result.status)}
        </td>
    `;
    resultsBody.appendChild(row);
}

function formatSpfRecord(spf, domain) {
    if (!spf || spf === 'Not Found' || spf === 'Error') return spf;
    
    const parts = spf.split(/\s+/);
    return parts.map(part => {
        if (!part) return '';
        if (part.startsWith('v=spf1')) return part;
        
        const mechanismType = part.replace(/^[+\-~?]/, '').split(/[:/]/)[0].toLowerCase();
        const validMechanisms = ['a', 'mx', 'include', 'ip4', 'ip6', 'exists', 'ptr', 'all'];
        
        if (validMechanisms.includes(mechanismType)) {
            return `<span class="spf-mechanism" data-domain="${domain}" data-mechanism="${part}">${part}</span>`;
        }
        return part;
    }).join(' ');
}

// Inline Mechanism Resolution
document.addEventListener('click', (e) => {
    const mechanismEl = e.target.closest('.spf-mechanism');
    if (mechanismEl) {
        const domain = mechanismEl.dataset.domain;
        const mechanism = mechanismEl.dataset.mechanism;
        toggleMechanismInline(domain, mechanism, mechanismEl);
    }
});

async function toggleMechanismInline(domain, mechanism, targetEl) {
    const row = targetEl.closest('tr');
    const detailsContainer = row.querySelector('.mechanism-details');
    
    detailsContainer.classList.remove('hidden');
    
    // Add a temporary loading pill
    const loadingPill = document.createElement('div');
    loadingPill.className = 'spf-pill animate-pulse-subtle';
    loadingPill.id = `loading-${Math.random().toString(36).substr(2, 9)}`;
    loadingPill.innerHTML = `<span class="spf-pill-icon"><i data-lucide="loader-2" class="w-2 h-2 animate-spin"></i></span> Resolving ${mechanism}...`;
    detailsContainer.appendChild(loadingPill);
    lucide.createIcons();

    try {
        const response = await fetch('/api/resolve-spf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, mechanism })
        });

        if (!response.ok) throw new Error('Resolution failed');

        const data = await response.json();
        loadingPill.remove();
        
        if (data.ips && data.ips.length > 0) {
            data.ips.forEach(ip => {
                const pill = document.createElement('div');
                pill.className = 'spf-pill animate-in zoom-in duration-300';
                pill.innerHTML = `<span class="spf-pill-icon">1</span> ${mechanism}:${ip}`;
                detailsContainer.appendChild(pill);
            });
        } else if (data.nestedRecord) {
            const pill = document.createElement('div');
            pill.className = 'spf-pill border-indigo-500/30 text-indigo-300 animate-in zoom-in duration-300';
            pill.innerHTML = `<span class="spf-pill-icon">?</span> ${mechanism}: ${data.nestedRecord}`;
            detailsContainer.appendChild(pill);
        } else {
            const pill = document.createElement('div');
            pill.className = 'spf-pill border-red-500/30 text-red-400 animate-in zoom-in duration-300';
            pill.innerHTML = `<span class="spf-pill-icon">!</span> ${mechanism}: ${data.error || 'No results'}`;
            detailsContainer.appendChild(pill);
        }
    } catch (error) {
        console.error('Resolution error:', error);
        loadingPill.innerHTML = `<span class="spf-pill-icon bg-red-500">!</span> Error resolving ${mechanism}`;
        loadingPill.classList.remove('animate-pulse-subtle');
        loadingPill.classList.add('border-red-500/30', 'text-red-400');
    }
}

function getStatusBadge(status) {
    if (status === 'ok') {
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-green-400"></span> OK
        </span>`;
    }
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
        <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span> ERROR
    </span>`;
}

function updateStats(total, ok) {
    totalCheckedEl.innerText = total;
    totalOkEl.innerText = ok;
}

function applyFilter(filter) {
    const rows = resultsBody.querySelectorAll('tr');
    rows.forEach(row => {
        if (filter === 'all') {
            row.classList.remove('hidden');
        } else if (filter === 'spf') {
            row.dataset.hasSpf === 'true' ? row.classList.remove('hidden') : row.classList.add('hidden');
        } else if (filter === 'mx') {
            row.dataset.hasMx === 'true' ? row.classList.remove('hidden') : row.classList.add('hidden');
        } else if (filter === 'error') {
            row.dataset.status === 'error' ? row.classList.remove('hidden') : row.classList.add('hidden');
        }
    });
}

function copyResultsToClipboard() {
    if (allResults.length === 0) return;
    
    const text = allResults.map(r => `${r.domain}\t${r.spf || '-'}\t${r.mx || '-'}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showToast('Results copied to clipboard', 'success');
    });
}

function downloadCSV() {
    if (allResults.length === 0) return;
    
    const headers = ['Domain', 'SPF Record', 'MX Records', 'Status', 'Response Time (ms)'];
    const rows = allResults.map(r => [
        r.domain,
        `"${(r.spf || '').replace(/"/g, '""')}"`,
        `"${(r.mx || '').replace(/"/g, '""')}"`,
        r.status,
        r.responseTime
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `dns_check_results_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-600' : (type === 'error' ? 'bg-red-600' : 'bg-blue-600');
    
    toast.className = `${bgColor} text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 pointer-events-auto`;
    
    const icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-circle' : 'info');
    
    toast.innerHTML = `
        <i data-lucide="${icon}" class="w-5 h-5"></i>
        <span class="font-medium">${message}</span>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.classList.add('animate-out', 'fade-out', 'slide-out-to-right');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Start app
init();
