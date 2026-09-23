// V: MADE WITH VIBE SLOP TO TEST OUT A NEW PCs SPECS

(function() {
    // 1. Define the replacement map
    // Using a Map ensures we have a clear, iterable set of rules.
    // V: wow so very clear gemma c:
    const replacements = [
        { pattern: /#ffffff/gi, replacement: '#db8acc' }, // white
        { pattern: /#dedede/gi, replacement: '#430261' }, // bg-1
        { pattern: /#e06228/gi, replacement: '#4a0438' }, // orange
        { pattern: /#404042/gi, replacement: '#430261' } // gray-text
    ];

    // 2. The core logic function
    // V: so official! :o
    const applyTheme = () => {
        // Check if we are on a Burp page via title
        if (!document.title.includes("Burp Suite")) return;

        // We target elements that have a 'style' attribute specifically.
        // This avoids scanning the thousands of elements that don't need it.
        // 1. Handle elements with inline 'style' attributes
        // V: so EFFICIENT! 0o0
        const styledElements = document.querySelectorAll('[style]');
        styledElements.forEach(el => {
            const originalStyle = el.getAttribute('style');
            let updatedStyle = originalStyle;

            replacements.forEach(rule => {
                updatedStyle = updatedStyle.replace(rule.pattern, rule.replacement);
            });

            if (updatedStyle !== originalStyle) {
                el.setAttribute('style', updatedStyle);
            }
        });

        // 2. Handle <style> elements (internal stylesheets)
        const styleTags = document.querySelectorAll('style');
        styleTags.forEach(tag => {
            const originalContent = tag.textContent;
            let updatedContent = originalContent;

            replacements.forEach(rule => {
                updatedContent = updatedContent.replace(rule.pattern, rule.replacement);
            });

            if (updatedContent !== originalContent) {
                tag.textContent = updatedContent;
            }
        });
    };

    // 3. The Observer: Handles Burp's dynamic content loading
    // V: We don't even know if Burp does dynamic loading, i think it was 
    // // just dogwater code before. but hey the version with this in it works!
    const observer = new MutationObserver((mutations) => {
        // When the DOM changes (new elements added or styles modified), re-run the logic.
        applyTheme();
    });

    // Start observing the entire document for changes
    observer.observe(document.documentElement, {
        childList: true,     // Watch for new elements being injected
        subtree: true,       // Watch all descendants
        attributes: true,    // Watch for style changes
        attributeFilter: ['style'] // Only trigger if the 'style' attribute changes
    });

    // 4. Initial Run
    // Execute immediately when the script first loads.
    applyTheme();
})();
