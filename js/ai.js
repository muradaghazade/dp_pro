/* ============================================================
   ai.js — simulated AI mastering engine
   parse → categorize → attributes → values → duplicate-check → validate
   Deterministic: known demo profiles + a generic fallback parser.
   ============================================================ */
(function () {

    /* ---- helpers for attribute extraction ---- */
    function firstMatch(t, re) { const m = t.match(re); return m ? m[0] : ''; }
    function dims3(t) { const m = t.match(/(\d{1,4}(?:\.\d+)?)\s*[x×]\s*(\d{1,4}(?:\.\d+)?)\s*[x×]\s*(\d{1,4}(?:\.\d+)?)/); return m ? [m[1], m[2], m[3]] : []; }

    /* ---- MRO description structure — identical to the mastered records:
       short: NOUN,QUALIFIER:IDENT             → BEARING,BALL:6307-2RS1
       long:  <short> SPEC,SPEC,…,MFR:X,MPN:Y → BELT,V:17X1850 V-BELT,17MM X 1850MM,BANDED,MFR:GATES,MPN:9635-01850 ---- */
    function mroShort(noun, qual, ident) {
        let s = String(noun || 'ITEM').toUpperCase().trim();
        if (qual) s += ',' + String(qual).toUpperCase().trim();
        if (ident) s += ':' + String(ident).toUpperCase().replace(/\s+/g, '');
        return s;
    }
    function mroLong(shortDesc, specs, manufacturer, mfrPartNo) {
        const parts = (specs || []).filter(s => s && String(s).trim())
            .map(s => String(s).toUpperCase().replace(/\s+/g, ' ')
                .replace(/(\d)\s+(MM|CM|KG|BAR|HZ|KW|KN|KV|AWG|G|M|L|V|A|W)\b/g, '$1$2').trim());
        if (manufacturer) parts.push('MFR:' + String(manufacturer).toUpperCase());
        if (mfrPartNo) parts.push('MPN:' + String(mfrPartNo).toUpperCase());
        return parts.length ? shortDesc + ' ' + parts.join(',') : shortDesc;
    }

    /* ---- Known demo profiles keyed by matching keywords. Each build() aims for >= 8 attributes. ---- */
    const PROFILES = [
        {
            match: (t) => /belt/.test(t) && (/spc\s?2500|spc2500|wedge|v-?belt/.test(t)),
            build: () => ({
                summary: 'Wedge V-belt, SKF PHG SPC2500, Section SPC, Pitch Length 2500 mm',
                unspsc: '26111801', unspscLabel: 'V belts', category: 'V belts', materialGroup: 'M008.0001',
                manufacturer: 'SKF', mfrPartNo: 'SPC2500', matTypeChoice: 'OEM', baseUom: 'EA',
                name: 'Belt; Wedge V-belt, SKF, PHG SPC2500, Section SPC, Pitch Length 2500 mm',
                shortName: mroShort('Belt', 'V', 'SPC2500'),
                longDesc: mroLong(mroShort('Belt', 'V', 'SPC2500'),
                    ['Wedge V-belt', 'Section SPC', 'Pitch length 2500mm', 'Inner length 2416mm', 'Outer length 2529mm', 'Top width 22mm', 'Height 18mm'],
                    'SKF', 'SPC2500'),
                attributes: {
                    'Belt profile/section': 'SPC', 'Belt type': 'Wedge V-belt', 'Belt properties': 'Cogged',
                    'Top width': '22 mm', 'Wrapped cover': 'Yes', 'Construction': 'Wrapped',
                    'Effective length (Lw/Lp)': '2500 mm', 'Inner length (Li)': '2416 mm', 'Outer length (La)': '2529 mm',
                    'Belt body material': 'CR (polychloroprene)', 'Tensile cord material': 'Polyester',
                    'Sub-brand': 'PHG', 'Product net weight': '0.81 kg'
                }
            })
        },
        {
            match: (t) => /(ball|roller)\s*bearing|bearing/.test(t),
            build: (t) => {
                const part = (t.match(/\b([0-9]{3,4}-?2rs[a-z0-9]*|[0-9]{3,4}-?2z[a-z0-9]*|[0-9]{3,4}vv[a-z0-9]*|6\d{2,3}|60\d{2}|30\d{2,3})\b/i) || [])[0] || '';
                const d = dims3(t);
                const mfr = /skf/i.test(t) ? 'SKF' : (/nsk/i.test(t) ? 'NSK' : (/fag/i.test(t) ? 'FAG (Schaeffler)' : ''));
                const seal = /2rs/i.test(t) ? '2RS contact seal' : (/2z|zz/i.test(t) ? '2Z metal shields' : (/vv/i.test(t) ? 'VV non-contact seal' : 'Open'));
                const clr = (/c3/i.test(t) ? 'C3' : (/c4/i.test(t) ? 'C4' : 'CN')) + ' clearance';
                const short = mroShort('Bearing', 'Ball', part || (d.length ? d.join('X') : ''));
                return {
                    summary: 'Single row deep groove ball bearing' + (part ? ', ' + part.toUpperCase() : ''),
                    unspsc: '31171504', unspscLabel: 'Ball bearings', category: 'Roller bearings', materialGroup: 'M005.0004',
                    manufacturer: mfr,
                    mfrPartNo: part.toUpperCase(), matTypeChoice: part ? 'OEM' : 'Generic', baseUom: 'EA',
                    name: 'Ball bearing; Single row deep groove' + (part ? ', ' + part.toUpperCase() : ''),
                    shortName: short,
                    longDesc: mroLong(short, ['Deep groove', 'Single row', d.length ? d.map(x => x + 'mm').join(' X ') : '', seal, clr], mfr, part.toUpperCase()),
                    attributes: {
                        'Bearing type': 'Deep groove ball bearing', 'Row count': 'Single row',
                        'Bore diameter': d[0] ? d[0] + ' mm' : '', 'Outside diameter': d[1] ? d[1] + ' mm' : '', 'Width': d[2] ? d[2] + ' mm' : '',
                        'Seal/shield type': /2rs/i.test(t) ? '2RS (contact seals)' : (/2z|zz/i.test(t) ? '2Z (metal shields)' : (/vv/i.test(t) ? 'VV (non-contact seals)' : 'Open')),
                        'Internal clearance': /c3/i.test(t) ? 'C3' : (/c4/i.test(t) ? 'C4' : 'CN'),
                        'Cage material': 'Steel'
                    }
                };
            }
        },
        {
            match: (t) => /(gate|ball|check|globe)\s*valve|valve/.test(t),
            build: (t) => {
                const part = (t.match(/\b(gv[- ]?\d{2,4}[- ]?pn\d{1,3}|[a-z]{1,3}-?\d{2,4}-?pn\d{1,3})\b/i) || [])[0] || '';
                const size = firstMatch(t, /\bdn\s?\d{2,4}\b/i) || firstMatch(t, /\b\d{2,4}\s?mm\b/i);
                const pn = firstMatch(t, /\bpn\s?\d{1,3}\b/i);
                const body = /stainless/i.test(t) ? 'Stainless steel' : (/cast iron/i.test(t) ? 'Cast iron' : 'Cast steel');
                const short = mroShort('Valve', 'Gate', (size || part || '').replace(/\s+/g, ''));
                return {
                    summary: 'Gate valve, cast steel, flanged' + (part ? ', ' + part.toUpperCase() : ''),
                    unspsc: '40141607', unspscLabel: 'Gate valves', category: 'Pipeline fittings', materialGroup: 'M007.0002',
                    manufacturer: '', mfrPartNo: part.toUpperCase(), matTypeChoice: 'Generic', baseUom: 'EA',
                    name: 'Gate valve; Cast steel, flanged',
                    shortName: short,
                    longDesc: mroLong(short, [body, 'Flanged ends', size, pn, /gear/i.test(t) ? 'Gear operated' : 'Handwheel operated'], '', part.toUpperCase()),
                    attributes: {
                        'Nominal size': size ? size.toUpperCase().replace(/\s/, '') : '',
                        'Pressure rating': pn ? pn.toUpperCase().replace(/\s/, '') : '',
                        'Body material': /stainless/i.test(t) ? 'Stainless steel' : (/cast iron/i.test(t) ? 'Cast iron' : 'Cast steel'),
                        'End connection': /thread/i.test(t) ? 'Threaded' : (/weld/i.test(t) ? 'Butt-weld' : 'Flanged'),
                        'Operation': /gear/i.test(t) ? 'Gear operated' : (/actuat/i.test(t) ? 'Actuated' : 'Handwheel'),
                        'Bonnet type': 'Bolted bonnet',
                        'Stem type': /non-?rising/i.test(t) ? 'Non-rising stem' : 'Rising stem',
                        'Standard': 'API 600'
                    }
                };
            }
        },
        {
            match: (t) => /electrode|welding\s*rod/.test(t),
            build: (t) => {
                const dia = (t.match(/\b(\d(?:\.\d)?)\s?mm\b/) || [])[1] || '';
                const aws = firstMatch(t, /\be\d{4}-?[a-z0-9]*\b/i);
                const emfr = /esab/i.test(t) ? 'ESAB' : (/lincoln/i.test(t) ? 'Lincoln Electric' : '');
                const epn = firstMatch(t, /\bok\s?\d{2}\.\d{2}\b/i).toUpperCase();
                const short = mroShort('Electrode', 'Welding', aws || (dia ? dia + 'MM' : ''));
                return {
                    summary: 'Welding electrode, flux-coated' + (aws ? ', ' + aws.toUpperCase() : ''),
                    unspsc: '23271807', unspscLabel: 'Welding electrodes', category: 'Metal products', materialGroup: 'M002.0002',
                    manufacturer: emfr,
                    mfrPartNo: epn, matTypeChoice: 'OEM', baseUom: 'KG',
                    name: 'Welding electrode; flux-coated', shortName: short,
                    longDesc: mroLong(short, ['Flux-coated', dia ? dia + 'mm' : '', aws, /dc/i.test(t) ? 'DC+' : 'AC/DC', 'Vacuum pack'], emfr, epn),
                    attributes: {
                        'Electrode diameter': dia ? dia + ' mm' : '',
                        'Electrode length': /300/.test(t) ? '300 mm' : '350 mm',
                        'AWS classification': aws ? aws.toUpperCase() : '',
                        'Coating': 'Flux-coated (basic)',
                        'Current type': /dc/i.test(t) ? 'DC+' : 'AC/DC',
                        'Packaging': 'Vacuum pack',
                        'Alloy composition': /cr/i.test(t) ? 'Cr-Mo alloy' : 'Carbon steel',
                        'Welding position': 'All positions'
                    }
                };
            }
        },
        {
            match: (t) => /patch\s*cord|cat\s?6|cat\s?5|ethernet\s*cable|utp|ftp/.test(t),
            build: (t) => {
                const len = (t.match(/\b(\d+(?:\.\d+)?)\s?m\b/) || [])[1] || '';
                const cat = firstMatch(t, /\bcat\s?\d[a-z]?\b/i);
                const cmfr = /shturmann/i.test(t) ? 'SHTURMANN' : '';
                const cshort = mroShort('Cord', 'Patch', cat ? cat.replace(/\s+/g, '') : '');
                return {
                    summary: 'Datacom patch cord' + (cat ? ', ' + cat.toUpperCase() : ''),
                    unspsc: '26121636', unspscLabel: 'Patch cords', category: 'Control cables', materialGroup: 'M010.0002',
                    manufacturer: cmfr, mfrPartNo: '', matTypeChoice: 'Commercial', baseUom: 'EA',
                    name: 'Datacom patch cord' + (cat ? ', ' + cat.toUpperCase() : ''), shortName: cshort,
                    longDesc: mroLong(cshort, ['Datacom', /ftp/i.test(t) ? 'FTP' : (/utp/i.test(t) ? 'UTP' : 'FTP'), len ? len + 'm' : '', 'RJ45', '26 AWG'], cmfr, ''),
                    attributes: {
                        'Category': cat ? cat.toUpperCase().replace(/\s/, '') : 'CAT6',
                        'Shielding': /ftp/i.test(t) ? 'FTP' : (/utp/i.test(t) ? 'UTP' : 'FTP'),
                        'Length': len ? len + ' m' : '',
                        'Conductor': 'Stranded bare copper',
                        'Insulation': 'PE',
                        'Connector type': 'RJ45',
                        'Conductor gauge': '26 AWG',
                        'Jacket colour': 'Grey'
                    }
                };
            }
        },
        {
            // Hydraulic hose — intentionally NOT in the seeded category catalog, to show a
            // newly-identified category being added to the catalog on search.
            match: (t) => /hydraulic\s*hose|\bhose\b/.test(t),
            build: (t) => {
                const id = firstMatch(t, /\bdn\s?\d{1,3}\b/i) || firstMatch(t, /\b\d\/\d\s?in\b/i) || firstMatch(t, /\b\d{1,2}\s?mm\b/i);
                const manu = /parker/i.test(t) ? 'Parker' : (/gates/i.test(t) ? 'Gates' : (/manuli/i.test(t) ? 'Manuli' : ''));
                const hpn = firstMatch(t, /\b\d{3}[a-z]{2}-?\d{1,2}\b/i).toUpperCase();
                const hshort = mroShort('Hose', 'Hydraulic', (id || '').replace(/\s+/g, ''));
                return {
                    summary: 'Hydraulic hose, wire-braided' + (id ? ', ' + id.toUpperCase() : ''),
                    unspsc: '40142303', unspscLabel: 'Hydraulic hoses', category: 'Hoses', materialGroup: 'M008.0003',
                    manufacturer: manu, mfrPartNo: hpn,
                    matTypeChoice: manu ? 'OEM' : 'Generic', baseUom: 'M',
                    name: 'Hydraulic hose; wire-braided' + (id ? ', ' + id.toUpperCase() : ''), shortName: hshort,
                    longDesc: mroLong(hshort, ['Wire-braided', id, /two|2\s*wire|2-wire/i.test(t) ? 'Two-wire braid' : 'One-wire braid', '250 bar', 'EN 853'], manu, hpn),
                    attributes: {
                        'Inner diameter': id ? id.toUpperCase() : '',
                        'Reinforcement': /two|2\s*wire|2-wire/i.test(t) ? 'Two-wire braid' : 'One-wire braid',
                        'Working pressure': '250 bar',
                        'Burst pressure': '1000 bar',
                        'Tube material': 'Synthetic rubber (NBR)',
                        'Cover material': 'Abrasion-resistant rubber',
                        'Temperature range': '-40 to +100 °C',
                        'Standard': 'EN 853'
                    }
                };
            }
        }
    ];

    /* ---- generic fallback parse ---- */
    function genericParse(text) {
        const t = text.trim();
        // heuristic manufacturer / part-no extraction
        const partNo = (t.match(/\b([A-Z]{1,4}[- ]?\d{2,6}[A-Z0-9-]*)\b/) || [])[1] || '';
        // MRO-structured descriptions, same shape as the mastered records:
        // noun = last domain-recognised word, qualifier = the word before it,
        // ident = part number or size token, specs = the remaining text
        const words = t.split(/\s+/);
        let nounIdx = -1;
        words.forEach((w, i) => { if (CAT_DOMAINS.some(d => d.re.test(w.toLowerCase()))) nounIdx = i; });
        let noun = (nounIdx !== -1 ? words[nounIdx] : (words[0] || 'Item')).replace(/[^A-Za-z-]/g, '');
        let qual = nounIdx > 0 ? words[nounIdx - 1].replace(/[^A-Za-z0-9-]/g, '') : '';
        // "insulating tape" — a domain word ending in -ing qualifies the noun that follows it
        if (/ing$/i.test(noun) && nounIdx !== -1 && nounIdx + 1 < words.length) {
            const nxt = words[nounIdx + 1].replace(/[^A-Za-z-]/g, '');
            if (nxt && /^[A-Za-z-]+$/.test(words[nounIdx + 1].replace(/[.,;]$/, '')) && !CAT_STOP.has(nxt.toLowerCase())) { qual = noun; noun = nxt; }
        }
        if (!/[a-z]/i.test(qual) || CAT_STOP.has(qual.toLowerCase())) qual = '';
        const sizeTok = firstMatch(t, /\b[a-z]?\d{1,4}(?:\.\d+)?\s?[x×]\s?\d{1,4}(?:\.\d+)?(?:\s?[x×]\s?\d{1,4}(?:\.\d+)?)?\b/i);
        const short = mroShort(noun, qual, partNo || sizeTok);
        let rest = ' ' + t + ' ';
        [noun, qual, partNo, sizeTok].filter(Boolean).forEach(w => { rest = rest.split(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).join(' '); });
        const specs = rest.split(/[,;]+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 1);
        return {
            summary: t.slice(0, 90) + (t.length > 90 ? '…' : ''),
            unspsc: '', unspscLabel: '', category: '', materialGroup: '',   // no category → category_missing
            manufacturer: '', mfrPartNo: partNo, matTypeChoice: 'Generic', baseUom: 'EA',
            name: t.slice(0, 120), shortName: short, longDesc: mroLong(short, specs, '', partNo),
            attributes: {}
        };
    }

    /* ---- canonical MRO descriptions for ANY payload — applied when an item is
       mastered so every new record matches the structure of the existing master
       (noun/qualifier from the category label or the typed text, ident from the
       part number or a size token, specs from the attribute values) ---- */
    function structuredDesc(p, rawText) {
        p = p || {};
        let text = String(rawText || p.shortName || p.name || '');
        if (!/[a-z]/.test(text) && p.name) text = String(p.name);   // already MRO-coded → derive from the readable name
        let noun = '', qual = '';
        const label = String(p.unspscLabel || '').trim();
        if (label) {
            const lw = label.split(/\s+/);
            noun = lw[lw.length - 1].replace(/ies$/i, 'y').replace(/s$/i, '');
            if (lw.length > 1 && lw[0].toLowerCase() !== noun.toLowerCase()) qual = lw[0];
        } else {
            const words = text.split(/\s+/);
            let nounIdx = -1;
            words.forEach((w, i) => { if (CAT_DOMAINS.some(d => d.re.test(w.toLowerCase()))) nounIdx = i; });
            noun = (nounIdx !== -1 ? words[nounIdx] : (words[0] || 'Item')).replace(/[^A-Za-z-]/g, '');
            qual = nounIdx > 0 ? words[nounIdx - 1].replace(/[^A-Za-z0-9-]/g, '') : '';
            // "Solenoid valve …" — no domain word, but the second word is a plain noun
            if (nounIdx === -1 && words.length > 1) {
                const w1 = words[1].replace(/[.,;]$/, '');
                if (/^[a-z-]+$/.test(w1) && !CAT_STOP.has(w1)) { noun = w1; qual = words[0].replace(/[^A-Za-z0-9-]/g, ''); }
            }
            // "insulating tape" / "wire rope" — the domain word qualifies the plain
            // lowercase noun that follows it (capitalised words are brands, digits are specs)
            if (nounIdx !== -1 && nounIdx + 1 < words.length) {
                const raw = words[nounIdx + 1].replace(/[.,;]$/, '');
                if ((/ing$/i.test(noun) || /^[a-z-]+$/.test(raw)) && /^[A-Za-z-]+$/.test(raw) &&
                    (/^[a-z]/.test(raw) || /ing$/i.test(noun)) && !CAT_STOP.has(raw.toLowerCase())) { qual = noun; noun = raw; }
            }
            if (!/[a-z]/i.test(qual) || CAT_STOP.has(qual.toLowerCase())) qual = '';
        }
        const sizeTok = firstMatch(text, /\b[a-z]?\d{1,4}(?:\.\d+)?\s?[x×]\s?\d{1,4}(?:\.\d+)?(?:\s?[x×]\s?\d{1,4}(?:\.\d+)?)?\b/i);
        const ident = p.mfrPartNo || sizeTok || '';
        const short = mroShort(noun, qual, ident);
        const mfr = (p.manufacturer && p.manufacturer.trim().toLowerCase() !== 'various') ? p.manufacturer.trim() : '';
        let specs = Object.keys(p.attributes || {}).map(k => p.attributes[k])
            .filter(v => v && String(v).trim() && String(v).toUpperCase() !== String(ident).toUpperCase());
        if (!specs.length) {
            // no attribute values yet — take the specs from the remaining typed text
            let rest = ' ' + text + ' ';
            [noun, qual, ident, mfr].filter(Boolean).forEach(w => {
                rest = rest.split(new RegExp(String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).join(' ');
            });
            specs = rest.split(/[,;]+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 1);
        }
        return { shortName: short, longDesc: mroLong(short, specs, mfr, p.mfrPartNo || '') };
    }

    /* ---- NEW-category proposal: when no catalog category matches, the AI still
       identifies what the item IS and proposes a category (label + UNSPSC) plus
       an attribute schema for it. Deterministic and keyword-driven. ---- */
    const mkA = (name, fieldType, uom, mandatory, options) =>
        ({ name, fieldType: fieldType || 'Text', uom: uom || '', mandatory: !!mandatory, options: options || '' });

    const CAT_DOMAINS = [
        { re: /insulat|bushing|dielectric/, label: 'Electrical insulators', prefix: '3912', attrs: [
            mkA('Rated voltage', 'Number', '', true), mkA('Material', 'List', '', true, 'Ceramic, Porcelain, Composite, Glass'),
            mkA('Creepage distance', 'Number', 'MM'), mkA('Mounting type', 'List', '', false, 'Pin, Post, Suspension, Bushing') ] },
        { re: /bolt|screw|nut\b|washer|stud|rivet|fastener/, label: 'Fasteners', prefix: '3116', attrs: [
            mkA('Thread size', 'Text', '', true), mkA('Length', 'Number', 'MM', true), mkA('Material grade', 'Text', '', true),
            mkA('Coating', 'List', '', false, 'Zinc plated, Hot-dip galvanised, Black oxide, Plain'), mkA('Head type', 'Text') ] },
        { re: /gasket|o-?ring|seal\b|sealing|packing/, label: 'Seals & gaskets', prefix: '3117', attrs: [
            mkA('Inner diameter', 'Number', 'MM', true), mkA('Outer diameter', 'Number', 'MM'), mkA('Thickness', 'Number', 'MM'),
            mkA('Material', 'List', '', true, 'NBR, FKM, EPDM, PTFE, Graphite') ] },
        { re: /cable|wire\b|conductor/, label: 'Cables & wires', prefix: '2612', attrs: [
            mkA('Conductor cross-section', 'Number', 'MM', true), mkA('Number of cores', 'Number', '', true), mkA('Rated voltage', 'Number'),
            mkA('Insulation material', 'List', '', false, 'PVC, XLPE, Rubber, Silicone'), mkA('Shielded', 'Yes/No') ] },
        { re: /fuse|breaker|relay|contactor|switchgear|switch\b/, label: 'Electrical protection & switching', prefix: '3912', attrs: [
            mkA('Rated current', 'Number', '', true), mkA('Rated voltage', 'Number', '', true), mkA('Number of poles', 'Number'),
            mkA('Mounting', 'List', '', false, 'DIN rail, Panel, Plug-in'), mkA('Breaking capacity', 'Number') ] },
        { re: /filter|cartridge|strainer/, label: 'Filters', prefix: '4016', attrs: [
            mkA('Filtration rating', 'Number', '', true), mkA('Filter media', 'List', '', true, 'Cellulose, Glass fibre, Metal mesh, Synthetic'),
            mkA('Connection size', 'Text'), mkA('Max flow rate', 'Number'), mkA('Collapse pressure', 'Number') ] },
        { re: /pump\b|pumps\b/, label: 'Pumps', prefix: '4015', attrs: [
            mkA('Flow rate', 'Number', '', true), mkA('Head', 'Number', 'M', true), mkA('Power', 'Number', '', true),
            mkA('Speed', 'Number'), mkA('Inlet/outlet size', 'Text'), mkA('Casing material', 'Text') ] },
        { re: /\bmotor\b|gearbox|drive unit/, label: 'Electric motors & drives', prefix: '2610', attrs: [
            mkA('Power', 'Number', '', true), mkA('Speed', 'Number', '', true), mkA('Voltage', 'Number', '', true),
            mkA('Frame size', 'Text'), mkA('Efficiency class', 'List', '', false, 'IE1, IE2, IE3, IE4'),
            mkA('Mounting arrangement', 'List', '', false, 'B3, B5, B14, B35') ] },
        { re: /pipe\b|tube\b|fitting|flange|elbow|\btee\b|coupling|nipple/, label: 'Pipes & fittings', prefix: '4017', attrs: [
            mkA('Nominal diameter (DN)', 'Number', 'MM', true), mkA('Pressure rating (PN)', 'Number', '', true),
            mkA('Material', 'List', '', true, 'Carbon steel, Stainless steel, PVC, Copper'),
            mkA('End connection', 'List', '', false, 'Welded, Threaded, Flanged, Grooved'), mkA('Wall thickness', 'Number', 'MM') ] },
        { re: /\boil\b|grease|lubricant/, label: 'Lubricants', prefix: '1512', attrs: [
            mkA('Viscosity grade', 'Text', '', true), mkA('Base oil type', 'List', '', true, 'Mineral, Synthetic, Semi-synthetic'),
            mkA('NLGI grade', 'Text'), mkA('Operating temperature range', 'Range'), mkA('Package size', 'Number', 'L') ] },
        { re: /wrench|spanner|hammer|drill\b|screwdriver|plier|chisel|hand tool/, label: 'Hand tools', prefix: '2711', attrs: [
            mkA('Size', 'Text', '', true), mkA('Drive size', 'Text'), mkA('Material', 'Text'), mkA('Finish', 'Text') ] },
        { re: /acid\b|solvent|paint\b|adhesive|sealant|chemical|inhibitor|degreaser/, label: 'Chemicals & coatings', prefix: '1210', attrs: [
            mkA('Chemical composition', 'Text', '', true), mkA('Concentration', 'Number', '', true),
            mkA('Package size', 'Number', 'L'), mkA('Hazard class', 'Text'), mkA('Shelf life', 'Number') ] },
        { re: /sensor|gauge|transmitter|thermometer|manometer|flowmeter|indicator/, label: 'Instrumentation', prefix: '4111', attrs: [
            mkA('Measuring range', 'Range', '', true), mkA('Accuracy', 'Number'),
            mkA('Output signal', 'List', '', true, '4–20 mA, 0–10 V, Digital'), mkA('Process connection', 'Text'), mkA('Display', 'Yes/No') ] }
    ];

    const CAT_STOP = new Set(['high', 'low', 'heavy', 'duty', 'with', 'for', 'and', 'the', 'type', 'set', 'new', 'industrial', 'spare', 'part', 'parts']);

    function catHash(str) {
        let h = 7;
        for (let i = 0; i < str.length; i++) h = ((h * 33) + str.charCodeAt(i)) >>> 0;
        return h;
    }

    function suggestCategory(rawText) {
        const raw = (rawText || '').trim();
        const t = raw.toLowerCase();
        const domain = CAT_DOMAINS.find(d => d.re instanceof RegExp ? d.re.test(t) : false) || null;

        // derive the category name from the item nouns: strip part numbers, brands
        // (ALL-CAPS tokens), measures and stop-words, keep the first three words
        const words = raw
            .replace(/\b[A-Z]{1,4}[- ]?\d{2,6}[A-Z0-9-]*\b/g, ' ')
            .replace(/\d+([.,]\d+)?\s*(mm|cm|m|kg|g|l|ml|kv|v|a|w|kw|bar|psi|rpm|micron|mesh|°c)\b/gi, ' ')
            .split(/\s+/)
            .filter(w => /^[A-Za-z-]{3,}$/.test(w))
            .filter(w => !(w.length >= 2 && w === w.toUpperCase()))          // brand-like tokens
            .filter(w => !CAT_STOP.has(w.toLowerCase()));
        // anchor the name on the domain-matched noun (e.g. "… hex bolt" → "Steel hex bolts")
        let name = '';
        if (domain) {
            const idx = words.findIndex(w => domain.re.test(w.toLowerCase()));
            if (idx !== -1) name = words.slice(Math.max(0, idx - 2), idx + 1).join(' ').toLowerCase();
        }
        if (!name) name = words.slice(0, 3).join(' ').toLowerCase();
        if (name) {
            name = name.charAt(0).toUpperCase() + name.slice(1);
            if (!/s$/i.test(name)) name += 's';
        } else {
            name = domain ? domain.label : 'General materials';
        }

        const prefix = domain ? domain.prefix : '2410';
        const unspsc = prefix + String(1000 + (catHash(name) % 9000));

        // attribute schema: domain attrs + description-driven signals + base set
        const attrs = [];
        const addAttr = (a) => { if (!attrs.some(x => x.name.toLowerCase() === a.name.toLowerCase())) attrs.push(a); };
        (domain ? domain.attrs : []).forEach(a => addAttr(Object.assign({}, a)));
        if (/\d\s*k?v\b|volt/i.test(t)) addAttr(mkA('Rated voltage', 'Number'));
        if (/\bbar\b|\bpn\s?\d|pressure|psi/i.test(t)) addAttr(mkA('Pressure rating', 'Number'));
        if (/temperatur|°c|celsius|heat resist/i.test(t)) addAttr(mkA('Operating temperature range', 'Range'));
        if (/\bmm\b|diameter|length|width|height|\bø/i.test(t)) addAttr(mkA('Overall dimensions (L×W×H)', 'Text'));
        addAttr(mkA('Material', 'Text', '', !domain));
        addAttr(mkA('Standard / norm', 'Text'));
        addAttr(mkA('Weight', 'Number', 'KG'));

        return { categoryName: name, unspsc, catAttributes: attrs.slice(0, 10) };
    }

    /* ---- living-catalog lookup: find a category previously added via a
       new-category request (or by the AI) that matches this search. Matches by
       the deterministic suggested UNSPSC, or by the category label's word stems
       so it still works after the Central team renamed the category. ---- */
    function catStem(w) { return w.replace(/(ings|ing|s)$/, ''); }

    function findCatalogCategory(rawText, sug) {
        const list = (window.Store.get().datasets || {}).CATEGORY_ATTRIBUTES || [];
        const stems = new Set(tokens(rawText).map(catStem));
        let best = null, bestScore = 0;
        for (const c of list) {
            if (sug && c.unspsc && c.unspsc === sug.unspsc) return c;
            const lt = tokens(c.label || '').map(catStem);
            if (!lt.length) continue;
            let hit = 0;
            lt.forEach(w => { if (stems.has(w)) hit++; });
            const score = hit / lt.length;
            if (score >= 0.6 && score > bestScore) { best = c; bestScore = score; }
        }
        return best;
    }

    /* ---- duplicate detection ---- */
    function tokens(s) { return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2); }
    function score(a, b) {
        const A = new Set(tokens(a)), B = tokens(b);
        if (!B.length) return 0;
        let hit = 0; B.forEach(w => { if (A.has(w)) hit++; });
        return hit / Math.max(A.size, B.length);
    }

    function findMatches(parsed, rawText) {
        const mats = window.Store.materials();
        const results = [];
        mats.forEach(m => {
            let sc = 0;
            // strong signal: same manufacturer part number
            if (parsed.mfrPartNo && m.mfrPartNo &&
                parsed.mfrPartNo.replace(/\s/g, '').toLowerCase() === m.mfrPartNo.replace(/\s/g, '').toLowerCase()) sc = 0.99;
            else sc = Math.max(score(m.name + ' ' + m.longDesc, rawText), score(m.name, parsed.name));
            results.push({ m, sc });
        });
        results.sort((a, b) => b.sc - a.sc);
        return results;
    }

    /* ---- main entry ---- */
    function analyze(rawText) {
        const text = (rawText || '').toLowerCase();
        let parsed = null;
        for (const p of PROFILES) { if (p.match(text)) { parsed = p.build(text); break; } }
        const known = !!parsed;
        if (!parsed) parsed = genericParse(rawText || '');

        let categoryFound = !!parsed.materialGroup;
        // the built-in profiles don't know this item — but the living catalog might
        // (e.g. a category added earlier through a new-category request)
        let catalogCat = null;
        if (!categoryFound) {
            catalogCat = findCatalogCategory(rawText || '', suggestCategory(rawText || ''));
            if (catalogCat) {
                categoryFound = true;
                parsed.unspsc = catalogCat.unspsc;
                parsed.unspscLabel = catalogCat.label;
                parsed.category = catalogCat.label;
                if (catalogCat.materialGroup) parsed.materialGroup = catalogCat.materialGroup;
                if (!Object.keys(parsed.attributes || {}).length) {
                    const attrs = {};
                    (catalogCat.attributes || []).forEach(a => { attrs[a.name || a] = ''; });
                    parsed.attributes = attrs;
                }
            }
        }
        const ranked = findMatches(parsed, rawText || '');
        const best = ranked[0];
        const myPlant = window.Store.session().plant;

        let outcome, exactMatch = null, similar = [], categorySuggestion = null;
        if (!categoryFound) {
            outcome = 'category_missing';
            categorySuggestion = suggestCategory(rawText);
        } else if (best && best.sc >= 0.85) {
            exactMatch = best.m;
            const inMyPlant = exactMatch.plants.indexOf(myPlant) !== -1;
            outcome = inMyPlant ? 'exists_my_plant' : 'exists_other_plant';
        } else {
            outcome = 'not_found';
            // similar = same category/group, decent score
            similar = ranked
                .filter(r => r.sc > 0.08 || (parsed.materialGroup && r.m.materialGroup === parsed.materialGroup))
                .slice(0, 4).map(r => r.m);
        }

        return {
            raw: rawText, known, parsed, categoryFound, outcome,
            exactMatch, similar, categorySuggestion,
            steps: [
                { label: 'Parsed description', detail: parsed.summary },
                { label: 'Categorised item', detail: categoryFound ? `UNSPSC ${parsed.unspsc} · ${parsed.unspscLabel}`
                    : (categorySuggestion ? `No match — proposing new category “${categorySuggestion.categoryName}” · UNSPSC ${categorySuggestion.unspsc}` : 'No matching category found') },
                { label: 'Resolved attributes', detail: categoryFound ? `${Object.keys(parsed.attributes).length} attributes for “${parsed.category}”`
                    : (categorySuggestion ? `${categorySuggestion.catAttributes.length} attributes proposed for the new category` : '—') },
                { label: 'Filled attribute values', detail: categoryFound ? (catalogCat ? 'Attribute set loaded from the category catalog — fill in the values' : 'Values extracted from description') : '—' },
                { label: 'Checked material master', detail: outcomeLabel(outcome, exactMatch, myPlant) }
            ]
        };
    }

    function outcomeLabel(outcome, m, myPlant) {
        switch (outcome) {
            case 'exists_my_plant': return 'Already exists in your plant (' + myPlant + ')';
            case 'exists_other_plant': return 'Exists in plant ' + (m ? m.plants[0] : '') + ' — extend to yours';
            case 'not_found': return 'Not found — similar items shown';
            case 'category_missing': return 'Category not in system';
        }
        return '';
    }

    /* ---- build a create-request payload from analysis ---- */
    function toPayload(analysis) {
        const p = analysis.parsed;
        const s = window.Store.session();
        return {
            name: p.name, shortName: p.shortName, longDesc: p.longDesc,
            materialType: 'ROH', matTypeChoice: p.matTypeChoice,
            manufacturer: p.manufacturer, mfrPartNo: p.mfrPartNo,
            unspsc: p.unspsc, unspscLabel: p.unspscLabel, category: p.category,
            materialGroup: p.materialGroup,
            materialDescription: '', // filled from group in the form
            baseUom: p.baseUom, plants: [s.plant], plant: s.plant,
            storageLocation: guessStorage(p.materialGroup),
            mrpEnabled: 'Yes', batchManaged: 'No', mrpType: 'PD',
            recordType: 'Golden record',
            valuationClass: '',
            attributes: Object.assign({}, p.attributes),
            image: ''
        };
    }
    function guessStorage(group) {
        if (!group) return '';
        const n = group.slice(1, 4);           // M008.0001 → 008
        const code = 'M' + n;
        return window.Seed.STORAGE_LOCATIONS.indexOf(code) !== -1 ? code : '';
    }

    /* ---- validation: blocking (blank mandatory) + warnings (AI feedback) ---- */
    const MANDATORY = [
        { k: 'materialGroup', label: 'Material Group' },
        { k: 'shortName', label: 'Short name' },
        { k: 'longDesc', label: 'Long description' },
        { k: 'baseUom', label: 'Base unit of measure' },
        { k: 'plant', label: 'Plant' },
        { k: 'storageLocation', label: 'Storage location' },
        { k: 'mrpEnabled', label: 'MRP planning enabled' },
        { k: 'batchManaged', label: 'Batch-managed' },
        { k: 'mrpType', label: 'MRP type' },
        { k: 'matTypeChoice', label: 'Material type (OEM/Generic/…)' },
        { k: 'recordType', label: 'Golden/Sourcing record' }
    ];

    function validate(payload) {
        const blocking = [];
        MANDATORY.forEach(f => {
            const v = payload[f.k];
            if (v === undefined || v === null || String(v).trim() === '') blocking.push({ field: f.k, msg: f.label + ' is required.' });
        });

        // mandatory category attributes (from the category schema) also block submission
        const schema = (window.UI && window.UI.categorySchema) ? window.UI.categorySchema(payload.unspsc) : null;
        if (schema) {
            (schema.attributes || []).forEach(a => {
                if (a && a.mandatory) {
                    const v = (payload.attributes || {})[a.name];
                    if (v === undefined || v === null || String(v).trim() === '') {
                        blocking.push({ field: 'attr::' + a.name, msg: 'Attribute “' + a.name + '” is required.' });
                    }
                }
            });
        }

        const warnings = [];
        const hasMfr = payload.manufacturer && payload.manufacturer.trim() && payload.manufacturer.trim().toLowerCase() !== 'various';
        const hasPart = payload.mfrPartNo && payload.mfrPartNo.trim();

        if (payload.matTypeChoice === 'OEM' && (!hasMfr || !hasPart)) {
            warnings.push({
                level: 'warn',
                msg: 'Material type is OEM — Manufacturer name and Manufacturer part number should be provided. Please fill them in.'
            });
        }
        if (payload.matTypeChoice === 'Generic' && hasMfr && hasPart) {
            warnings.push({
                level: 'recommend',
                msg: `This looks like an OEM part (Manufacturer “${payload.manufacturer}”, Part # “${payload.mfrPartNo}”). Consider changing Material type to OEM.`
            });
        }
        if (payload.materialGroup && payload.storageLocation &&
            payload.storageLocation !== ('M' + payload.materialGroup.slice(1, 4))) {
            warnings.push({
                level: 'recommend',
                msg: `Storage location ${payload.storageLocation} does not align with Material Group ${payload.materialGroup}. Expected M${payload.materialGroup.slice(1, 4)}.`
            });
        }

        return { ok: blocking.length === 0, blocking, warnings };
    }

    /* ---- register an AI-identified category into the living catalog (upsert) ---- */
    function registerCategory(analysis) {
        if (!analysis || !analysis.categoryFound) return false;
        const p = analysis.parsed;
        const attrs = Object.keys(p.attributes || {});
        let added = false, changed = false;
        const mkAttr = (name) => ({ name, uom: '', mandatory: false, fieldType: 'Text', options: '' });
        window.Store.set(s => {
            if (!Array.isArray(s.datasets.CATEGORY_ATTRIBUTES)) s.datasets.CATEGORY_ATTRIBUTES = [];
            const list = s.datasets.CATEGORY_ATTRIBUTES;
            const existing = list.find(c => c.unspsc === p.unspsc);
            if (existing) {
                attrs.forEach(a => { if (!existing.attributes.some(x => (x.name || x) === a)) { existing.attributes.push(mkAttr(a)); changed = true; } });
                if (!existing.label && p.unspscLabel) existing.label = p.unspscLabel;
            } else {
                list.push({ unspsc: p.unspsc, label: p.unspscLabel, materialGroup: p.materialGroup, attributes: attrs.map(mkAttr), addedByAI: true });
                added = true;
            }
        });
        return added || changed;
    }

    window.AI = { analyze, toPayload, validate, guessStorage, registerCategory, suggestCategory, structuredDesc };
})();
