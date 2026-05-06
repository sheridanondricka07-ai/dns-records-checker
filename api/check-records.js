const dns = require('dns').promises;
const pLimit = require('p-limit');

const DEFAULT_TIMEOUT = 5000; // 5 seconds
const CONCURRENCY_LIMIT = 15;

/**
 * Helper to wrap a promise with a timeout
 */
const withTimeout = (promise, ms) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error('Timeout'));
        }, ms);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
};

/**
 * Process a single domain for SPF and MX records
 */
async function checkDomain(domain, checkSPF, checkMX) {
    const startTime = Date.now();
    const result = {
        domain,
        spf: null,
        mx: null,
        status: 'ok',
        responseTime: 0
    };

    try {
        const tasks = [];

        if (checkSPF) {
            tasks.push(
                withTimeout(dns.resolveTxt(domain), DEFAULT_TIMEOUT)
                    .then(records => {
                        const spfRecord = records
                            .flat()
                            .find(txt => txt.startsWith('v=spf1'));
                        result.spf = spfRecord || 'Not Found';
                    })
                    .catch(err => {
                        if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
                            result.spf = 'Not Found';
                        } else {
                            throw err;
                        }
                    })
            );
        }

        if (checkMX) {
            tasks.push(
                withTimeout(dns.resolveMx(domain), DEFAULT_TIMEOUT)
                    .then(records => {
                        if (records && records.length > 0) {
                            // Sort by priority and join hostnames
                            result.mx = records
                                .sort((a, b) => a.priority - b.priority)
                                .map(r => r.exchange)
                                .join(', ');
                        } else {
                            result.mx = 'Not Found';
                        }
                    })
                    .catch(err => {
                        if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
                            result.mx = 'Not Found';
                        } else {
                            throw err;
                        }
                    })
            );
        }

        await Promise.all(tasks);
    } catch (err) {
        result.status = 'error';
        result.error = err.message;
        if (checkSPF && !result.spf) result.spf = 'Error';
        if (checkMX && !result.mx) result.mx = 'Error';
    } finally {
        result.responseTime = Date.now() - startTime;
    }

    return result;
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { domains, checkSPF, checkMX } = req.body;

    if (!Array.isArray(domains) || domains.length === 0) {
        return res.status(400).json({ error: 'Invalid domains list' });
    }

    // Clean and deduplicate domains
    const cleanDomains = [...new Set(
        domains
            .map(d => d.trim().toLowerCase())
            .filter(d => d.length > 0 && d.includes('.'))
    )];

    if (cleanDomains.length === 0) {
        return res.status(400).json({ error: 'No valid domains provided' });
    }

    const limit = pLimit(CONCURRENCY_LIMIT);
    const results = await Promise.all(
        cleanDomains.map(domain => limit(() => checkDomain(domain, !!checkSPF, !!checkMX)))
    );

    res.status(200).json(results);
};
