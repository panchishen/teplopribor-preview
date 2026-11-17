/* Demo only: no submission, storage, analytics or reading file contents. */
'use strict';
(() => {
  const root = document.querySelector('#forms-root');
  const status = document.querySelector('.launch-status');
  let loading;
  let activeTrigger;

  function showError(input, text) {
    input.setAttribute('aria-invalid', 'true');
    let error;
    if (input.name === 'personal_data_consent') {
      error = input.closest('.consent-block').querySelector('.consent-error');
    } else {
      error = input.parentElement.querySelector('.field-error');
      if (!error) {
        error = document.createElement('p');
        error.className = 'field-error';
        input.parentElement.append(error);
      }
    }
    error.id = `${input.id}-error`;
    error.textContent = text;
    error.hidden = false;
    input.setAttribute('aria-describedby', error.id);
  }

  function clearError(input) {
    input.removeAttribute('aria-invalid');
    const errorId = input.getAttribute('aria-describedby');
    if (errorId) {
      const error = document.getElementById(errorId);
      if (error) { error.hidden = true; error.textContent = ''; }
      input.removeAttribute('aria-describedby');
    }
  }

  function validate(input) {
    clearError(input);
    if (input.type === 'checkbox' && !input.checked) {
      showError(input, 'Для отправки формы подтвердите согласие на обработку персональных данных.');
      return false;
    }
    if (input.required && !input.value.trim()) {
      showError(input, 'Заполните это поле.');
      return false;
    }
    if (!input.validity.valid) {
      showError(input, input.type === 'email' ? 'Укажите корректный адрес электронной почты.' : 'Проверьте значение поля.');
      return false;
    }
    return true;
  }

  function initialize() {
    const template = root.querySelector('#consent-template');
    root.querySelectorAll('form').forEach(form => {
      form.querySelector('[data-consent]').append(template.content.cloneNode(true));
      const checkbox = form.querySelector('.consent-input');
      checkbox.id = `${form.dataset.form}-consent`;
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (form.dataset.form === 'quote' && form.querySelector('[data-order-item]').hidden) return;
        const fields = [...form.querySelectorAll('input, textarea')];
        const invalid = fields.filter(input => !validate(input));
        const result = form.querySelector('.form-result');
        result.hidden = true;
        if (invalid.length) { invalid[0].focus(); return; }
        result.textContent = 'Проверка пройдена. В демонстрации заявка не отправляется.';
        result.hidden = false;
        result.tabIndex = -1;
        result.focus();
      });
      form.addEventListener('input', event => {
        if (event.target.matches('input, textarea')) {
          if (event.target.hasAttribute('aria-invalid')) validate(event.target);
          form.querySelector('.form-result').hidden = true;
        }
      });
      form.addEventListener('change', event => {
        if (event.target.matches('input, textarea') && event.target.hasAttribute('aria-invalid')) validate(event.target);
      });
    });
    root.querySelectorAll('dialog').forEach(dialog => {
      dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
      dialog.querySelector('[data-add-products]')?.addEventListener('click', () => dialog.close());
      dialog.querySelector('[data-remove-product]')?.addEventListener('click', () => {
        const item = dialog.querySelector('[data-order-item]');
        item.hidden = true;
        item.querySelector('input').disabled = true;
        dialog.querySelector('.empty-cart').hidden = false;
        dialog.querySelector('[type=submit]').disabled = true;
        dialog.querySelector('.form-result').hidden = true;
        dialog.querySelector('[data-add-products]').focus();
      });
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      });
      dialog.addEventListener('close', () => activeTrigger?.focus());
    });
  }

  async function loadForms() {
    if (!loading) {
      loading = fetch('form.html').then(response => {
        if (!response.ok) throw new Error('Form loading failed');
        return response.text();
      }).then(html => { root.innerHTML = html; initialize(); }).catch(error => { loading = null; throw error; });
    }
    return loading;
  }

  document.querySelectorAll('[data-open]').forEach(button => {
    button.addEventListener('click', async () => {
      document.querySelectorAll('[data-open]').forEach(trigger => { trigger.disabled = true; });
      status.textContent = 'Загрузка формы…';
      try {
        await loadForms();
        const dialog = root.querySelector(`#${button.dataset.open}-dialog`);
        const form = dialog.querySelector('form');
        form.reset();
        if (form.dataset.form === 'quote') {
          form.querySelector('[data-order-item]').hidden = false;
          form.querySelector('#quote-quantity').disabled = false;
          form.querySelector('.empty-cart').hidden = true;
          form.querySelector('[type=submit]').disabled = false;
        }
        form.querySelectorAll('input, textarea').forEach(clearError);
        form.querySelector('.form-result').hidden = true;
        activeTrigger = button;
        dialog.showModal();
        dialog.scrollTop = 0;
        dialog.querySelector('h1').focus();
        status.textContent = '';
      } catch {
        status.textContent = 'Не удалось загрузить формы. Обновите страницу. Для просмотра нужен локальный веб-сервер.';
      } finally {
        document.querySelectorAll('[data-open]').forEach(trigger => { trigger.disabled = false; });
      }
    });
  });
})();
