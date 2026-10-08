const fs = require('fs');
let code = fs.readFileSync('frontend/components/catalog/QuickViewModal.tsx', 'utf8');

// Replace state
code = code.replace(
  'const [activeVariant, setActiveVariant] = useState<EnrichedMarco | null>(null);',
  \const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const activeVariant = variants.find(v => v.id_ext === activeVariantId) || variants[0];\
);

// Replace useEffect
code = code.replace(
  \      setActiveVariant(variants[0]);\,
  \      setActiveVariantId(variants[0].id_ext);\
);

// Replace setActiveVariant calls
code = code.replace(
  /setActiveVariant\\(v\\);/g,
  'setActiveVariantId(v.id_ext);'
);

// Remove the activeVariant null check in the return
code = code.replace(
  'if (!isOpen || variants.length === 0 || !activeVariant) return null;',
  'if (!isOpen || variants.length === 0) return null;'
);

fs.writeFileSync('frontend/components/catalog/QuickViewModal.tsx', code, 'utf8');
console.log('Fixed QuickViewModal state.');

