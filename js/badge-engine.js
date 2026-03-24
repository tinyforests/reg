/**
 * ECOLOGICAL REGISTRY BADGE ENGINE
 * Calculates badges from garden data (score + verification + evidence)
 * Returns structured badge object for display across all pages
 */

function awardBadges(gardenData) {
    const scoreBadges = calculateScoreBadges(gardenData);
    const verificationBadges = calculateVerificationBadges(gardenData);
    const evidenceBadges = calculateEvidenceBadges(gardenData);

    const all = [
        ...scoreBadges,
        ...verificationBadges,
        ...evidenceBadges
    ];

    return {
        score_badges: scoreBadges,
        verification_badges: verificationBadges,
        evidence_badges: evidenceBadges,
        all_badges: [...new Set(all)] // Remove duplicates
    };
}

function calculateScoreBadges(data) {
    const badges = [];
    const inputs = data.inputs || {};
    const score = data.current_score || scoreEcologicalRegistry(data);

    // Habitat Garden - Complete structural layers
    if (inputs.ground_layer_present && 
        inputs.shrub_layer_present && 
        inputs.subcanopy_present && 
        inputs.canopy_present) {
        badges.push('habitat_garden');
    }

    // Indigenous Dominant - 80%+ indigenous species
    if (inputs.indigenous_percent >= 80) {
        badges.push('indigenous_dominant');
    }

    // Water Sensitive - Comprehensive water management
    if (inputs.swale_or_infiltration && 
        inputs.permeable_surfaces && 
        (inputs.rainwater_use || inputs.passive_irrigation)) {
        badges.push('water_sensitive');
    }

    // High Function Garden - Score 70+
    if (score >= 70) {
        badges.push('high_function_garden');
    }

    // Urban Biodiversity Node - High species count + habitat
    if (inputs.species_count >= 40 && 
        inputs.mixed_growth_forms && 
        inputs.flowering_succession) {
        badges.push('urban_biodiversity_node');
    }

    // Registered Ecological Garden - Full registry compliance
    if (inputs.registered_garden && 
        inputs.annual_update_complete && 
        inputs.field_report_complete) {
        badges.push('registered_ecological_garden');
    }

    // Pollinator Support - Dedicated pollinator resources
    if (inputs.pollinator_support && 
        inputs.flowering_succession && 
        inputs.indigenous_percent >= 60) {
        badges.push('pollinator_supporter');
    }

    // Regenerative Practices - Soil + ecosystem building
    if (inputs.mycorrhiza_or_regen_methods && 
        inputs.soil_improvement_works && 
        inputs.organic_matter_or_mulch && 
        inputs.no_synthetic_chemicals) {
        badges.push('regenerative_practices');
    }

    return badges;
}

function calculateVerificationBadges(data) {
    const badges = [];
    const inputs = data.inputs || {};

    // Verified Garden - Professional assessment
    if (data.verification_level === 'gardener_and_son_verified') {
        badges.push('verified_garden');
    }

    // Registry Member - Active registry participation
    if (inputs.registered_garden && inputs.registered_in_network) {
        badges.push('registry_member');
    }

    // Long Term Steward - Multiple assessments over time
    const scoreHistory = data.score_history || [];
    if (scoreHistory.length >= 3) {
        badges.push('long_term_steward');
    }

    // Documentation Complete - Full reporting
    if (inputs.field_report_complete && 
        inputs.monitoring_photos_uploaded && 
        inputs.habitat_additions_recorded) {
        badges.push('documentation_complete');
    }

    return badges;
}

function calculateEvidenceBadges(data) {
    const badges = [];
    const fieldNotes = data.field_notes || [];

    // Process field notes for evidence signals
    const signals = new Set();
    for (let note of fieldNotes) {
        if (note.signals) {
            note.signals.forEach(signal => signals.add(signal));
        }
    }

    // Amphibian Active - Amphibian activity documented
    if (signals.has('amphibian-activity') || signals.has('amphibian-breeding')) {
        badges.push('amphibian_active');
    }

    // Bird Breeding - Nesting or breeding activity
    if (signals.has('bird-nesting') || signals.has('bird-breeding')) {
        badges.push('bird_breeding');
    }

    // Pollinator Hotspot - High pollinator activity observed
    if (signals.has('pollinator-abundance') || signals.has('native-bee-activity')) {
        badges.push('pollinator_hotspot');
    }

    // Corridor Node - Strategic habitat connectivity
    if (signals.has('corridor-function') || signals.has('wildlife-movement')) {
        badges.push('corridor_node');
    }

    // Water Habitat - Water feature supporting wildlife
    if (signals.has('water-habitat') || signals.has('aquatic-wildlife')) {
        badges.push('water_habitat');
    }

    // Regeneration Success - Evidence of ecosystem recovery
    if (signals.has('natural-regeneration') || signals.has('seed-recruitment')) {
        badges.push('regeneration_success');
    }

    return badges;
}

// Utility function to get badge metadata
async function getBadgeDefinitions() {
    try {
        const response = await fetch('/data/badge-definitions.json');
        return await response.json();
    } catch (error) {
        console.warn('Could not load badge definitions:', error);
        return {};
    }
}

// Render badges for display (used across all pages)
function renderBadges(badgeIds, containerSelector) {
    getBadgeDefinitions().then(definitions => {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        container.innerHTML = badgeIds.map(badgeId => {
            const badge = definitions[badgeId];
            if (!badge) return '';

            return `
                <div class="badge badge-${badge.type}" title="${badge.description}">
                    <span class="badge-name">${badge.name}</span>
                </div>
            `;
        }).join('');
    });
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { awardBadges, renderBadges, getBadgeDefinitions };
}
