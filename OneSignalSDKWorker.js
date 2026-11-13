// 1. Подключаем официальный скрипт OneSignal для приема пуш-уведомлений
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
// 2. Логика кэширования для офлайн-режима
// Важно: если будешь обновлять style.css или app.js, меняй версию (например, на v28), 
// чтобы браузер пользователей скачал новые файлы
const CACHE_NAME = 'btt-schedule-v31'; 

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.png',
  './manifest.json'
];

// Установка: сохраняем файлы в кэш
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Активируем новый воркер сразу, не дожидаясь закрытия вкладок
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Активация: удаляем старые версии кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Перехват запросов (Fetch)
self.addEventListener('fetch', (e) => {
  // Кэшируем только GET-запросы
  if (e.request.method !== 'GET') return;
  
  // Не кэшируем запросы к OneSignal и API Google (они всегда должны идти в сеть)
  if (e.request.url.includes('onesignal.com') || e.request.url.includes('googleapis.com')) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Если сеть ответила успешно, сохраняем свежую копию в кэш
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Если сети нет, отдаем файл из кэша
        const cached = await caches.match(e.request);
        return cached || new Response('Нет подключения к сети', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});