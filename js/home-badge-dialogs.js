/* Homepage badge explanations. Award rules remain in badge-engine.js. */
(function () {
  'use strict';
  var explanations = {
    corridor_node: {
      meaning: 'A garden can help wildlife move between habitat patches when its planting provides a functioning connection.',
      requirement: 'The garden record must have a confirmed corridor-node assessment. Nearby parks alone do not earn this badge: the assessment considers established planting, local species and the garden’s position between habitat patches.'
    },
    gs_verified: {
      meaning: 'Gardener & Son has assessed the garden and verified its recorded condition.',
      requirement: 'The record’s verification level must be G&S Verified. This identifies who verified the garden; it is not independent certification or a promise of a particular score.'
    },
    indigenous_dominant: {
      meaning: 'The planting is led by species indigenous to the garden’s local ecological community, rather than Australian plants from elsewhere.',
      requirement: 'The garden record must identify indigenous planting as dominant. Local vegetation context helps establish which species belong to this place.'
    },
    species_rich_20: {
      meaning: 'A varied indigenous planting palette contributes different forms, flowering seasons and habitat resources.',
      requirement: 'At least 20 indigenous plant species must be recorded as currently growing in the garden. Planned purchases do not count.'
    },
    species_rich_30: {
      meaning: 'This recognises a broader recorded indigenous plant palette.',
      requirement: 'At least 30 indigenous plant species must be recorded as currently growing in the garden. Species count is one measure; suitability to the place still matters.'
    },
    habitat_builder: {
      meaning: 'Distinct refuge areas give wildlife places to shelter, feed or breed.',
      requirement: 'At least three habitat nodes must be recorded in the garden. These are identifiable refuge areas, such as dense planting or a sheltered log-and-rock corner.'
    },
    amphibian_active: {
      meaning: 'Wildlife has been observed in the garden and the observation has been verified.',
      requirement: 'At least one fauna sighting must be marked verified in the garden record. Fauna Active includes wildlife beyond amphibians; a casual unverified observation does not earn it.'
    },
    pollinator_rich: {
      meaning: 'This badge currently recognises a growing record of verified wildlife observations.',
      requirement: 'The current award rule requires at least three verified fauna sightings. Despite the badge name, the rule does not yet distinguish pollinators from other fauna, so it is not proof of pollinator diversity.'
    },
    water_wise: {
      meaning: 'The garden combines rainwater capture with a place for water to gather and soak into the soil.',
      requirement: 'Both a rainwater system and a moisture basin must be recorded as present. One feature on its own does not earn this badge.'
    },
    five_layers: {
      meaning: 'Planting at different heights creates a more varied structure for habitat.',
      requirement: 'At least five structural planting layers must be recorded as present: groundcovers, grasses or tufting plants, low shrubs, mid-storey and canopy. Count established layers, not future planting.'
    },
    full_canopy: {
      meaning: 'Established tree cover is contributing overhead structure to the garden.',
      requirement: 'The garden record must show canopy cover of at least 30%. This refers to current cover, not the expected mature size of newly planted trees.'
    },
    network_connected: {
      meaning: 'The garden sits alongside other registered gardens in the ecological network.',
      requirement: 'At least two adjacent registered gardens must be recorded with their adjacency verified. This badge does not by itself confirm that a functioning wildlife corridor exists.'
    },
    full_record: {
      meaning: 'The garden has the four core kinds of evidence needed to make its story traceable over time.',
      requirement: 'The record must include photographs, field notes, a species list and a fauna record. Complete documentation does not mean every ecological claim has been independently verified.'
    },
    fauna_record: {
      meaning: 'A verified wildlife observation forms part of the garden’s lasting record.',
      requirement: 'At least one fauna sighting must be recorded and marked verified. This evidence badge shares the current threshold with Fauna Active.'
    }
  };
  document.querySelectorAll('[data-badge-explainer]').forEach(function (trigger) {
    var id = trigger.dataset.badgeExplainer;
    var definition = BADGE_DEFINITIONS[id];
    var explanation = explanations[id];
    if (!definition || !explanation) return;
    var dialog = document.createElement('dialog');
    dialog.id = 'badge-dialog-' + id;
    dialog.className = 'badge-dialog';
    dialog.setAttribute('aria-labelledby', dialog.id + '-title');
    dialog.setAttribute('aria-describedby', dialog.id + '-meaning');
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'badge-dialog-close';
    close.setAttribute('aria-label', 'Close ' + definition.name + ' explanation');
    close.textContent = '×';
    var category = document.createElement('p');
    category.className = 'badge-dialog-category';
    category.textContent = definition.category;
    var title = document.createElement('h2');
    title.id = dialog.id + '-title';
    title.textContent = definition.name;
    var meaning = document.createElement('p');
    meaning.id = dialog.id + '-meaning';
    meaning.textContent = explanation.meaning;
    var subheading = document.createElement('h3');
    subheading.textContent = 'How it is earned';
    var requirement = document.createElement('p');
    requirement.textContent = explanation.requirement;
    var link = document.createElement('a');
    link.href = '/score.html';
    link.className = 'badge-dialog-link';
    link.textContent = 'Explore the scoring method →';
    dialog.append(close, category, title, meaning, subheading, requirement, link);
    document.body.appendChild(dialog);
    trigger.addEventListener('click', function () {
      dialog.showModal();
      document.body.classList.add('badge-dialog-open');
      close.focus();
    });
    close.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      if (event.shiftKey && document.activeElement === close) {
        event.preventDefault(); link.focus();
      } else if (!event.shiftKey && document.activeElement === link) {
        event.preventDefault(); close.focus();
      }
    });
    dialog.addEventListener('click', function (event) {
      var box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
    dialog.addEventListener('close', function () {
      document.body.classList.remove('badge-dialog-open');
      trigger.focus();
    });
  });
})();
