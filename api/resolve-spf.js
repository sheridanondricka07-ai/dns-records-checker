const dns = require('dns').promises;

const DEFAULT_TIMEOUT = 8000; // Slightly longer for nested lookups

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
 * Resolves a specific SPF mechanism
 */
async function resolveMechanism(rootDomain, mechanism) {
    // Regex to parse: [qualifier][type][:value][/prefix]
    const match = mechanism.match(/^([+\-~?])?(a|mx|ptr|ip4|ip6|include|exists|all)(?:[:=]([^/]+))?(?:\/(\d+))?$/i);
    
    if (!match) {
        return { error: 'Invalid mechanism format', raw: mechanism };
    }

    const qualifier = match[1] || '+';
    const type = match[2].toLowerCase();
    let value = match[3] || rootDomain;
    const prefix = match[4];

    const results = {
        type,
        qualifier,
        value,
        prefix,
        ips: [],
        nestedRecord: null,
        error: null
    };

    try {
        switch (type) {
            case 'ip4':
            case 'ip6':
                results.ips.push(prefix ? `${value}/${prefix}` : value);
                break;

            case 'a':
            case 'exists':
                const aRecords = await withTimeout(dns.resolve4(value), DEFAULT_TIMEOUT).catch(() => []);
                const aaaaRecords = await withTimeout(dns.resolve6(value), DEFAULT_TIMEOUT).catch(() => []);
                results.ips = [...aRecords, ...aaaaRecords];
                if (results.ips.length === 0 && type === 'a') {
                    // Fallback to searching the domain itself if value was inferred
                    if (value !== rootDomain) {
                        // maybe already tried
                    }
                }
                break;

            case 'mx':
                const mxRecords = await withTimeout(dns.resolveMx(value), DEFAULT_TIMEOUT).catch(() => []);
                if (mxRecords.length > 0) {
                    const mxIps = await Promise.all(mxRecords.map(async (r) => {
                        try {
                            const a = await withTimeout(dns.resolve4(r.exchange), 2000).catch(() => []);
                            const aaaa = await withTimeout(dns.resolve6(r.exchange), 2000).catch(() => []);
                            return [...a, ...aaaa];
                        } catch (e) {
                            return [];
                        }
                    }));
                    results.ips = [...new Set(mxIps.flat())];
                }
                break;

            case 'include':
                const txtRecords = await withTimeout(dns.resolveTxt(value), DEFAULT_TIMEOUT).catch(() => []);
                const spf = txtRecords.flat().find(txt => txt.startsWith('v=spf1'));
                results.nestedRecord = spf || 'No SPF record found at ' + value;
                break;

            case 'ptr':
                results.error = 'PTR mechanism is deprecated and slow; not resolved.';
                break;

            case 'all':
                results.value = 'Matches all traffic';
                break;
        }
    } catch (err) {
        results.error = err.message;
    }

    return results;
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { domain, mechanism } = req.body;

    if (!domain || !mechanism) {
        return res.status(400).json({ error: 'Missing domain or mechanism' });
    }

    try {
        const result = await resolveMechanism(domain, mechanism);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
