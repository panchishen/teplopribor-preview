/* =========================================================================
   Теплоприбор — all form and order (cart) logic in one file.
   - Loads forms from /form.html into [data-form-slot] placeholders.
   - Validates (contact + consent), submits via fetch to data-endpoint.
     Empty endpoint = demo mode: success without a request.
   - Order (cart): localStorage "tp-order", header counter, "В заказ" buttons.
   ========================================================================= */
(function () {
  'use strict';

  var FORMS_URL = '/teplopribor-preview/site/form.html';
  var formsDoc = null;

  /* ---------- Loading forms ---------- */
  function loadFormsDoc() {
    if (formsDoc) return formsDoc;
    formsDoc = fetch(FORMS_URL, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); });
    return formsDoc;
  }

  function mountSlots() {
    var slots = document.querySelectorAll('[data-form-slot]');
    if (!slots.length) return;
    loadFormsDoc().then(function (doc) {
      slots.forEach(function (slot) {
        var src = doc.getElementById('form-' + slot.getAttribute('data-form-slot'));
        if (!src) return;
        slot.innerHTML = src.innerHTML;
        // loaded after the scroll-reveal observer started: show at once
        slot.querySelectorAll('.form-card').forEach(function (el) { el.classList.add('rv-done'); });
        initForm(slot);
      });
    }).catch(function () { /* noscript-like fallback text stays */ });
  }

  /* ---------- Validation ---------- */
  var reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function isContact(v) { return reEmail.test(v) || v.replace(/\D/g, '').length >= 10; }

  function setError(input, on) {
    var err = document.getElementById(input.getAttribute('aria-describedby'));
    input.setAttribute('aria-invalid', on ? 'true' : 'false');
    if (err) err.hidden = !on;
  }

  function validate(form) {
    var first = null;
    form.querySelectorAll('[required]').forEach(function (el) {
      var rule = el.getAttribute('data-validate');
      var pair = rule === 'contact-pair' ? document.getElementById(el.getAttribute('data-pair')) : null;
      var ok = el.type === 'checkbox' ? el.checked
        : rule === 'contact' ? isContact(el.value.trim())
        // phone OR the paired e-mail field (order form)
        : rule === 'contact-pair' ? (el.value.replace(/\D/g, '').length >= 10 || (pair && reEmail.test(pair.value.trim())))
        : el.value.trim() !== '';
      setError(el, !ok);
      if (!ok && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  }

  /* ---------- Submit ---------- */
  function initForm(root) {
    var form = root.querySelector('.js-form');
    if (!form) return;
    var done = root.querySelector('[data-form-done]');
    var errBox = form.querySelector('[data-form-error]');
    var btn = form.querySelector('[type=submit]');

    form.querySelectorAll('[required]').forEach(function (el) {
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', function () {
        if (el.getAttribute('aria-invalid') === 'true') setError(el, false);
      });
      var pair = el.getAttribute('data-pair') && document.getElementById(el.getAttribute('data-pair'));
      if (pair) pair.addEventListener('input', function () {
        if (el.getAttribute('aria-invalid') === 'true') setError(el, false);
      });
    });
    var file = form.querySelector('input[type=file]');
    if (file) file.addEventListener('change', function () {
      var label = form.querySelector('[data-file-label]');
      if (label && file.files[0]) label.textContent = file.files[0].name;
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (errBox) errBox.hidden = true;
      if (!validate(form)) return;
      if (form.website && form.website.value) return; // honeypot

      var data = new FormData(form);
      data.append('form', form.getAttribute('data-form'));
      data.append('consent_text_version', '2025-09-01');
      if (form.getAttribute('data-form') === 'order') data.append('items', JSON.stringify(Order.items()));

      btn.setAttribute('aria-busy', 'true');
      var endpoint = form.getAttribute('data-endpoint');
      var request = endpoint
        ? fetch(endpoint, { method: 'POST', body: data }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json().catch(function () { return {}; }); })
        : new Promise(function (res) { setTimeout(function () { res({}); }, 600); });

      request.then(function (res) {
        var id = (res && res.id) || ('TP-' + String(Date.now()).slice(-6));
        var idEl = done && done.querySelector('[data-request-id]');
        if (idEl) idEl.textContent = id;
        form.hidden = true;
        if (form.getAttribute('data-form') === 'order') { OrderPage.done(); Order.clear(); }
        if (done) { done.hidden = false; done.setAttribute('tabindex', '-1'); done.focus(); }
        document.dispatchEvent(new CustomEvent('tp:form-sent', { detail: { form: form.getAttribute('data-form'), id: id } }));
      }).catch(function () {
        if (errBox) errBox.hidden = false;
      }).then(function () {
        btn.removeAttribute('aria-busy');
      });
    });
  }

  /* ---------- Order (cart) ---------- */
  var KEY = 'tp-order';
  var Order = {
    items: function () {
      try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
    },
    save: function (list) {
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
      Order.render();
      document.dispatchEvent(new CustomEvent('tp:order-change', { detail: list }));
    },
    add: function (item) {
      var list = Order.items();
      var found = list.find(function (i) { return i.code === item.code; });
      if (found) found.qty += 1; else list.push({ code: item.code, name: item.name, price: item.price, img: item.img || '', qty: 1 });
      Order.save(list);
    },
    setQty: function (code, qty) {
      Order.save(Order.items().map(function (i) { if (i.code === code) i.qty = Math.max(1, qty); return i; }));
    },
    remove: function (code) {
      Order.save(Order.items().filter(function (i) { return i.code !== code; }));
    },
    clear: function () { Order.save([]); },
    count: function () { return Order.items().length; },
    render: function () {
      var n = Order.count();
      document.querySelectorAll('[data-order-count]').forEach(function (el) {
        el.textContent = n || '';
        el.setAttribute('data-count', n);
      });
    }
  };
  window.TpOrder = Order;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-add-to-order]');
    if (!btn) return;
    var card = btn.closest('[data-product], .sku');
    if (!card) return;
    var nameEl = card.querySelector('.name'), descEl = card.querySelector('.desc'), priceEl = card.querySelector('.price');
    var priceText = priceEl && !priceEl.classList.contains('rq') ? priceEl.firstChild.textContent : '';
    // photo: data-img on the card, else the first --img:url(...) inside it (concept cards)
    var imgEl = card.querySelector('[style*="--img"]');
    var imgMatch = imgEl && /--img:\s*url\(([^)]+)\)/.exec(imgEl.getAttribute('style'));
    Order.add({
      code: card.getAttribute('data-product') || (nameEl ? nameEl.textContent.trim() : ''),
      name: card.getAttribute('data-name') || (descEl ? descEl.textContent.trim() : ''),
      price: Number(card.getAttribute('data-price') || priceText.replace(/\D/g, '')) || null,
      img: card.getAttribute('data-img') || (imgMatch ? imgMatch[1].replace(/["']/g, '') : '')
    });
    btn.textContent = 'В заказе';
  });

  /* ---------- Order page (order.html): lines, totals, states ---------- */
  var OrderPage = {
    root: null,
    state: function (name) {
      var r = OrderPage.root;
      if (!r) return;
      r.classList.remove('is-filled', 'is-empty', 'is-done');
      r.classList.add('is-' + name);
      var empty = r.querySelector('[data-order-empty]');
      if (empty) empty.hidden = name !== 'empty';
    },
    done: function () {
      if (!OrderPage.root) return;
      OrderPage.state('done');
      OrderPage.root.scrollIntoView({ block: 'start' });
    },
    money: function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0') + '\u00A0₽'; },
    el: function (tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    },
    line: function (item) {
      var el = OrderPage.el, li = el('li', 'order-line');
      li.setAttribute('data-code', item.code);
      var ph = el('span', 'order-line-ph');
      if (item.img) ph.style.setProperty('--img', 'url("' + String(item.img).replace(/["\\]/g, '') + '")');
      var name = el('div', 'order-line-name');
      name.appendChild(el('span', 'order-line-code mono', item.code));
      name.appendChild(el('span', 'order-line-desc', (item.name ? item.name + ' · ' : '') + (item.price ? 'со склада' : 'под заказ')));
      var qty = el('div', 'stepper');
      qty.innerHTML = '<button type="button" data-qty="-1" aria-label="Меньше"><svg class="ico xs"><use href="#i-minus"/></svg></button>' +
        '<input type="number" min="1" inputmode="numeric" aria-label="Количество">' +
        '<button type="button" data-qty="1" aria-label="Больше"><svg class="ico xs"><use href="#i-plus"/></svg></button>';
      qty.querySelector('input').value = item.qty;
      var price = el('div', 'order-line-price');
      if (item.price) {
        price.appendChild(el('b', '', OrderPage.money(item.price * item.qty)));
        price.appendChild(el('span', '', OrderPage.money(item.price) + ' × ' + item.qty + ', без НДС'));
      } else {
        price.appendChild(el('span', '', 'Под заказ\u00A0— цену укажем в\u00A0КП'));
      }
      var del = el('button', 'order-line-del');
      del.type = 'button';
      del.setAttribute('data-remove', '');
      del.setAttribute('aria-label', 'Удалить ' + item.code);
      del.innerHTML = '<svg class="ico"><use href="#i-trash-2"/></svg>';
      [ph, name, qty, price, del].forEach(function (c) { li.appendChild(c); });
      return li;
    },
    render: function () {
      var r = OrderPage.root;
      if (!r || r.classList.contains('is-done')) return;
      var items = Order.items();
      var list = r.querySelector('[data-order-lines]');
      if (list) list.textContent = '';
      if (!items.length) { OrderPage.state('empty'); return; }
      OrderPage.state('filled');
      if (list) items.forEach(function (i) { list.appendChild(OrderPage.line(i)); });
      var sum = 0, rq = 0;
      items.forEach(function (i) { if (i.price) sum += i.price * i.qty; else rq++; });
      var set = function (sel, v) { var e = r.querySelector(sel); if (e) e.textContent = v; };
      set('[data-order-total-count]', items.length);
      set('[data-order-total-sum]', OrderPage.money(sum));
      set('[data-order-total-rq]', rq);
    },
    init: function () {
      var r = OrderPage.root = document.querySelector('[data-order-page]');
      if (!r) return;
      var list = r.querySelector('[data-order-lines]');
      if (list) {
        list.addEventListener('click', function (e) {
          var line = e.target.closest('.order-line');
          if (!line) return;
          var code = line.getAttribute('data-code');
          if (e.target.closest('[data-remove]')) { Order.remove(code); return; }
          var step = e.target.closest('[data-qty]');
          if (!step) return;
          var cur = Order.items().find(function (i) { return i.code === code; });
          if (cur) Order.setQty(code, cur.qty + Number(step.getAttribute('data-qty')));
        });
        list.addEventListener('change', function (e) {
          if (!e.target.matches('.stepper input')) return;
          Order.setQty(e.target.closest('.order-line').getAttribute('data-code'), parseInt(e.target.value, 10) || 1);
        });
      }
      var add = r.querySelector('[data-order-add]');
      if (add) add.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = add.querySelector('input');
        var code = input.value.trim();
        if (!code) { input.focus(); return; }
        Order.add({ code: code, name: '', price: null });
        input.value = '';
      });
      document.addEventListener('tp:order-change', OrderPage.render);
      OrderPage.render();
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    Order.render();
    OrderPage.init();
    mountSlots();
  });
})();
