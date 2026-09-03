
import requests
import json
import hashlib
import time
import logging
from datetime import datetime
from database import get_connection

logger = logging.getLogger(__name__)

class AIService:
    def __init__(self):
        self.providers = {
            'ollama': self._call_ollama,
            'gemini': self._call_gemini,
            'groq': self._call_groq,
            'openrouter': self._call_openrouter,
            'huggingface': self._call_huggingface,
            'together': self._call_together
        }
        self.OLLAMA_MODEL = 'llama3.2'
        self.ollama_available = self._check_ollama()
        if self.ollama_available:
            logger.info("[OK] Ollama detected locally -- will use as primary AI provider (FREE)")
        else:
            logger.info("[INFO] Ollama not detected -- will use online AI providers")

    def get_recommendations(self, media_item):
        """
        Get AI recommendations for a media item.
        First checks cache, then tries available providers/keys.
        """
        prompt = self._build_prompt(media_item)
        prompt_hash = self._hash_prompt(prompt)

        # 1. Check Cache
        cached = self._get_from_cache(prompt_hash)
        if cached:
            try:
                logger.info(f"AI Cache Hit for {media_item.get('title')}")
                data = json.loads(cached)
                
                # VALIDATION: Ensure new format (list of dicts)
                
                # 1. unwrapping if it's a dict (common AI behavior)
                if isinstance(data, dict):
                     for key in ['recommendations', 'items', 'movies', 'shows', 'results', 'data']:
                        if key in data and isinstance(data[key], list):
                            data = data[key]
                            break
                     else:
                        # Fallback (values)
                        if data: data = list(data.values())[0]

                # 2. Check if it's a list of strings (old format), invalidate
                if isinstance(data, list) and len(data) > 0 and isinstance(data[0], str):
                    logger.warning("Old cache format detected (strings). Invalidating to fetch new data.")
                    return None
                    
                return data
            except json.JSONDecodeError:
                logger.warning(f"Corrupt cache found for {media_item.get('title')}, ignoring.")
                # Fall through to fetch new data

        # 2. Try Ollama first (free, local, no key needed)
        if self.ollama_available:
            try:
                logger.info("Attempting AI request with Ollama (local)")
                response_text, tokens_used = self._call_ollama(None, prompt)
                self._save_to_cache(prompt_hash, response_text, 'ollama', tokens_used)
                return self._parse_json(response_text)
            except Exception as e:
                logger.warning(f"Ollama failed, falling back to online providers: {e}")

        # 3. Get Keys & Rotate across ALL providers using round-robin (oldest last_used first)
        keys = self._get_active_keys()
        
        for key_data in keys:
            provider_name = key_data['provider']
            try:
                logger.info(f"Attempting AI request with {provider_name} (Key ID: {key_data['id']})")
                response_text, tokens_used = self.providers[provider_name](key_data['api_key'], prompt)
                
                # Success
                self._update_usage(key_data['id'], tokens_used)
                self._save_to_cache(prompt_hash, response_text, provider_name, tokens_used)
                
                return self._parse_json(response_text)
                
            except Exception as e:
                logger.error(f"AI Provider Error ({provider_name}): {e}")
                self._log_error(key_data['id'])
                continue # Try next key/provider

        raise Exception("All AI providers failed or no keys available.")

    def parse_search_query(self, query):
        """
        Parse a natural language search query into JSON filters using AI.
        """
        prompt = f"""
        You are a smart search interpreter for a movie/tv library.
        User query: "{query}"
        
        Extract the following parameters if present in the user query:
        - genre (e.g. Action, Horror, Comedy, Romance, Sci-Fi)
        - year (e.g. 2010)
        - year_from (e.g. 2010 if they said "2010s")
        - year_to (e.g. 2019 if they said "2010s")
        - type (movie or series)
        - search (title or keywords mentioned, in English)
        
        Return ONLY keys that are certain from the query. If none apply, return empty object {{}}.
        IMPORTANT: You MUST return ONLY a raw JSON object, with no markdown formatting, no backticks.
        Valid Example: {{"genre": "Horror", "year_from": 2010, "year_to": 2019, "type": "movie"}}
        """
        prompt_hash = self._hash_prompt("search_" + prompt)
        
        # Check Cache
        cached = self._get_from_cache(prompt_hash)
        if cached:
            try:
                return json.loads(cached)
            except json.JSONDecodeError:
                pass

        # Try Ollama first for search parsing too
        if self.ollama_available:
            try:
                response_text, tokens_used = self._call_ollama(None, prompt)
                text = response_text.replace('```json', '').replace('```', '').strip()
                start = text.find('{')
                end = text.rfind('}') + 1
                if start != -1 and end != -1:
                    text = text[start:end]
                parsed_data = json.loads(text)
                self._save_to_cache(prompt_hash, json.dumps(parsed_data), 'ollama', tokens_used)
                return parsed_data
            except Exception as e:
                logger.warning(f"Ollama search parse failed, trying online: {e}")

        keys = self._get_active_keys()
        for key_data in keys:
            provider_name = key_data['provider']
            try:
                response_text, tokens_used = self.providers[provider_name](key_data['api_key'], prompt)
                self._update_usage(key_data['id'], tokens_used)
                
                # Parse output
                text = response_text.replace('```json', '').replace('```', '').strip()
                # find first { and last }
                start = text.find('{')
                end = text.rfind('}') + 1
                if start != -1 and end != -1:
                     text = text[start:end]
                
                parsed_data = json.loads(text)
                
                # Cache results
                self._save_to_cache(prompt_hash, json.dumps(parsed_data), provider_name, tokens_used)
                return parsed_data
                
            except Exception as e:
                logger.error(f"AI Search Parse Error ({provider_name}): {e}")
                self._log_error(key_data['id'])
                continue
                
        raise Exception("All AI providers failed to parse the search query.")

    def generate_catchup_summary(self, series_title: str, season_num: int, episode_num: int):
        """
        Generate a spoiler-free catch-up summary for a TV series.
        """
        prompt = f"""أنت مساعد سينمائي خبير. قم بتلخيص الأحداث الرئيسية السابقة لمسلسل '{series_title}' حتى الموسم {season_num} الحلقة {episode_num} باللغة العربية الفصحى وبأسلوب مشوق ومختصر (في 3-4 فقرات).
تحذير هام جداً: يُمنع منعاً باتاً ذكر أو حرق أي أحداث أو تفاصيل تقع بعد الموسم {season_num} الحلقة {episode_num}."""
        
        prompt_hash = self._hash_prompt("catchup_" + prompt)
        
        # Check Cache
        cached = self._get_from_cache(prompt_hash)
        if cached:
            try:
                return {
                    'summary': cached,
                    'series_title': series_title,
                    'up_to': f'S{season_num}E{episode_num}'
                }
            except Exception:
                pass

        # Try Ollama first
        if self.ollama_available:
            try:
                # We need raw text, not JSON
                url = "http://localhost:11434/v1/chat/completions"
                data = {
                    "model": self.OLLAMA_MODEL,
                    "messages": [
                        {"role": "system", "content": "أنت مساعد سينمائي. أجب بالعربية الفصحى مباشرة بدون مقدمات."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.5,
                    "stream": False
                }
                res = requests.post(url, json=data, timeout=60)
                res.raise_for_status()
                text = res.json()['choices'][0]['message']['content']
                tokens_used = res.json().get('usage', {}).get('total_tokens', 0)
                
                self._save_to_cache(prompt_hash, text, 'ollama', tokens_used)
                return {
                    'summary': text,
                    'series_title': series_title,
                    'up_to': f'S{season_num}E{episode_num}'
                }
            except Exception as e:
                logger.warning(f"Ollama catchup failed, trying online: {e}")

        # Fallback to online providers
        keys = self._get_active_keys()
        for key_data in keys:
            provider_name = key_data['provider']
            try:
                if provider_name == 'groq':
                    url = "https://api.groq.com/openai/v1/chat/completions"
                    headers = {"Authorization": f"Bearer {key_data['api_key']}", "Content-Type": "application/json"}
                    data = {
                        "messages": [
                            {"role": "system", "content": "أنت مساعد سينمائي. أجب بالعربية الفصحى مباشرة بدون مقدمات."},
                            {"role": "user", "content": prompt}
                        ],
                        "model": "llama-3.3-70b-versatile",
                        "temperature": 0.5
                    }
                    res = requests.post(url, headers=headers, json=data, timeout=30)
                    res.raise_for_status()
                    text = res.json()['choices'][0]['message']['content']
                    tokens_used = res.json().get('usage', {}).get('total_tokens', 0)
                    self._update_usage(key_data['id'], tokens_used)
                    self._save_to_cache(prompt_hash, text, provider_name, tokens_used)
                    return {
                        'summary': text,
                        'series_title': series_title,
                        'up_to': f'S{season_num}E{episode_num}'
                    }
            except Exception as e:
                logger.error(f"AI Catchup Error ({provider_name}): {e}")
                self._log_error(key_data['id'])
                continue
        # Friendly fallback if no AI key configured or AI call failed
        fallback_summary = f"تتبع الأحداث السابقة لمسلسل '{series_title}' الصراعات والتطورات المشوقة للشخصيات الرئيسية حتى الموسم {season_num} الحلقة {episode_num}. للمزيد من التلخيص التفصيلي بالذكاء الاصطناعي، يرجى تفعيل Ollama محلياً أو إضافة مفتاح API في صفحة الإعدادات."
        return {
            'summary': fallback_summary,
            'series_title': series_title,
            'up_to': f'S{season_num}E{episode_num}'
        }


    def _build_prompt(self, media):
        """Build the prompt for the AI"""
        # Determine source type to guide AI
        source_type = media.get('type', 'movie')
        if source_type in ['series', 'episode']:
             source_type = 'TV show'
        
        return f"""
        You are a media recommendation engine. I have a {source_type} titled "{media.get('title')}" ({media.get('year')}).
        Genres: {media.get('genres')}.
        Overview: {media.get('overview')}.
        
        Please recommend exactly 10 similar movies or TV shows. Mix both movies and TV shows if applicable.
        IMPORTANT: Return the ORIGINAL ENGLISH TITLES. Do not translate to Arabic.
        IMPORTANT: You MUST return ONLY a raw JSON array of objects, with no markdown formatting, no backticks, and no explanations.
        Valid Example: [{{"title": "The Matrix", "year": 1999, "type": "movie"}}, {{"title": "Breaking Bad", "year": 2008, "type": "series"}}]
        """


    def _call_gemini(self, api_key, prompt):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
        headers = {'Content-Type': 'application/json'}
        data = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        res = requests.post(url, headers=headers, json=data, timeout=10)
        res.raise_for_status()
        
        result = res.json()
        try:
            text = result['candidates'][0]['content']['parts'][0]['text']
            # Estimate tokens (Gemini sends usageMetadata sometimes, but simpler to estimate if missing)
            usage = result.get('usageMetadata', {})
            total_tokens = usage.get('totalTokenCount', len(prompt)/4 + len(text)/4)
            return text, int(total_tokens)
        except (KeyError, IndexError):
            raise Exception("Invalid Gemini response format")

    def _call_groq(self, api_key, prompt):
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        data = {
            "messages": [
                {"role": "system", "content": "You are a movie recommendation assistant. Output valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            "model": "llama-3.3-70b-versatile", # New stable model
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }
        res = requests.post(url, headers=headers, json=data, timeout=10)
        if not res.ok:
            logger.error(f"Groq API Error Body: {res.text}")
            res.raise_for_status()
        
        result = res.json()
        try:
            text = result['choices'][0]['message']['content']
            tokens = result.get('usage', {}).get('total_tokens', 0)
            return text, tokens
        except Exception as e:
            logger.error(f"Groq Parse Error: {result}")
            raise e
    
    def _call_openrouter(self, api_key, prompt):
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5000", 
            "X-Title": "SmartCinema"
        }
        data = {
            "messages": [
                 {"role": "system", "content": "You are a movie recommendation assistant. Output valid JSON only."},
                 {"role": "user", "content": prompt}
            ],
            "model": "google/gemini-2.0-flash-001",
        }
        res = requests.post(url, headers=headers, json=data, timeout=10)
        if not res.ok:
            logger.error(f"OpenRouter API Error Body: {res.text}")
            res.raise_for_status()
        
        result = res.json()
        try:
            text = result['choices'][0]['message']['content']
            tokens = result.get('usage', {}).get('total_tokens', 0)
            return text, tokens
        except Exception as e:
            logger.error(f"OpenRouter Parse Error: {result}")
            raise e

    def _call_huggingface(self, api_key, prompt):
        try:
            from huggingface_hub import InferenceClient
            client = InferenceClient(api_key=api_key)
            
            messages = [
                {"role": "system", "content": "You are a movie recommendation assistant. Output valid JSON only, no markdown."},
                {"role": "user", "content": prompt}
            ]
            
            response = client.chat_completion(
                model="meta-llama/Llama-3.2-3B-Instruct",
                messages=messages,
                max_tokens=1000,
                stream=False
            )
            
            text = response.choices[0].message.content
            tokens = response.usage.total_tokens if hasattr(response, 'usage') else 0
            
            return text, tokens
            
        except Exception as e:
            logger.error(f"HuggingFace Parse Error: {e}")
            raise e

    def _call_together(self, api_key, prompt):
        url = "https://api.together.xyz/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "messages": [
                {"role": "system", "content": "You are a movie recommendation assistant. Output valid JSON only, no markdown."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 1000,
            "temperature": 0.3
        }
        res = requests.post(url, headers=headers, json=data, timeout=10)
        if not res.ok:
            logger.error(f"Together API Error Body: {res.text}")
            res.raise_for_status()
            
        result = res.json()
        try:
            text = result['choices'][0]['message']['content']
            tokens = result.get('usage', {}).get('total_tokens', 0)
            return text, tokens
        except Exception as e:
            logger.error(f"Together Parse Error: {result}")
            raise e

    def _get_active_keys(self, provider=None):
        with get_connection() as conn:
            cursor = conn.cursor()
            if provider:
                cursor.execute("""
                    SELECT id, api_key, provider FROM ai_keys 
                    WHERE provider = ? AND is_active = 1 
                    ORDER BY last_used ASC, error_count ASC
                """, (provider,))
            else:
                cursor.execute("""
                    SELECT id, api_key, provider FROM ai_keys 
                    WHERE is_active = 1 
                    ORDER BY last_used ASC, error_count ASC
                """)
            return [dict(row) for row in cursor.fetchall()]

    def _update_usage(self, key_id, tokens):
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE ai_keys 
                SET total_tokens_used = total_tokens_used + ?,
                    last_used = CURRENT_TIMESTAMP,
                    error_count = 0
                WHERE id = ?
            """, (tokens, key_id))
            conn.commit()

    def _log_error(self, key_id):
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE ai_keys SET error_count = error_count + 1 WHERE id = ?", (key_id,))
            # Deactivate if too many errors
            cursor.execute("UPDATE ai_keys SET is_active = 0 WHERE id = ? AND error_count >= 5", (key_id,))
            conn.commit()

    def _hash_prompt(self, prompt):
        return hashlib.md5(prompt.encode()).hexdigest()

    def _get_from_cache(self, prompt_hash):
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT response FROM ai_cache WHERE prompt_hash = ?", (prompt_hash,))
            row = cursor.fetchone()
            return row['response'] if row else None

    def _save_to_cache(self, prompt_hash, response, provider, tokens):
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO ai_cache (prompt_hash, response, provider, tokens_used)
                VALUES (?, ?, ?, ?)
            """, (prompt_hash, response, provider, tokens))
            conn.commit()

    def _parse_json(self, text):
        # AI often wraps in ```json ... ```
        text = text.replace('```json', '').replace('```', '').strip()
        start = text.find('[')
        end = text.rfind(']') + 1
        
        parsed_data = None
        
        # Try finding array first
        if start != -1 and end != -1:
            try:
                snippet = text[start:end]
                parsed_data = json.loads(snippet)
            except json.JSONDecodeError:
                pass
        
        # Fallback to full parse (might be object)
        if parsed_data is None:
            try: 
                data = json.loads(text)
                if isinstance(data, dict):
                    # Try to find the list inside
                    for key in ['recommendations', 'items', 'movies', 'shows', 'results', 'data']:
                        if key in data and isinstance(data[key], list):
                            parsed_data = data[key]
                            break
                    # If no known key, return values if it's a list
                    if parsed_data is None and data:
                        parsed_data = list(data.values())[0] if isinstance(list(data.values())[0], list) else None
                elif isinstance(data, list):
                    parsed_data = data
            except json.JSONDecodeError:
                pass
                
        if not parsed_data or not isinstance(parsed_data, list):
            raise Exception("Failed to parse valid JSON array from AI response")
            
        return parsed_data

    def _check_ollama(self):
        """Check if Ollama is running locally"""
        try:
            res = requests.get('http://localhost:11434/api/tags', timeout=2)
            return res.ok
        except Exception:
            return False

    def _call_ollama(self, api_key, prompt):
        """Call local Ollama instance (api_key is ignored — it's free!)"""
        url = "http://localhost:11434/v1/chat/completions"
        data = {
            "model": self.OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": "You are a movie recommendation assistant. Output valid JSON only, no markdown, no explanations."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "stream": False
        }
        res = requests.post(url, json=data, timeout=120)
        res.raise_for_status()
        result = res.json()
        try:
            text = result['choices'][0]['message']['content']
            tokens = result.get('usage', {}).get('total_tokens', 0)
            return text, tokens
        except (KeyError, IndexError) as e:
            logger.error(f"Ollama Parse Error: {result}")
            raise e

    def chat(self, message: str, history: list = None) -> dict:
        """
        Full multi-turn AI chat with TMDB RAG context.
        Returns { 'text': str, 'media_cards': list }
        """
        import urllib.request, urllib.parse, json as _json
        history = history or []

        # ---- 1. TMDB RAG: search for relevant movies if query looks like a recommendation request ----
        tmdb_context = ""
        tmdb_results = []
        search_keywords = ['recommend', 'suggest', 'similar', 'like', 'best', 'top', 'show me',
                           'اقترح', 'مقترح', 'مشابه', 'زي', 'أحسن', 'أفضل', 'بشبه', 'ترشح', 'ترشيح', 'شغال']
        is_recommendation = any(kw in message.lower() for kw in search_keywords)
        
        if is_recommendation:
            try:
                from metadata import TMDB_API_KEY, TMDB_IMAGE_BASE
                # Extract search terms (use the message itself as the query)
                search_q = urllib.parse.urlencode({'api_key': TMDB_API_KEY, 'query': message, 'language': 'en-US', 'page': 1})
                url = f"https://api.themoviedb.org/3/search/multi?{search_q}"
                req_obj = urllib.request.Request(url, headers={'Accept': 'application/json'})
                with urllib.request.urlopen(req_obj, timeout=8) as resp:
                    data = _json.loads(resp.read().decode())
                results = [r for r in data.get('results', []) if r.get('media_type') in ('movie', 'tv')][:10]
                
                if not results:
                    # Try a discover trending call
                    turl = f"https://api.themoviedb.org/3/trending/all/week?api_key={TMDB_API_KEY}"
                    req2 = urllib.request.Request(turl, headers={'Accept': 'application/json'})
                    with urllib.request.urlopen(req2, timeout=8) as resp2:
                        data2 = _json.loads(resp2.read().decode())
                    results = data2.get('results', [])[:10]

                tmdb_results = results
                summaries = []
                for r in results:
                    title = r.get('title') or r.get('name', '')
                    year = (r.get('release_date') or r.get('first_air_date') or '')[:4]
                    overview = (r.get('overview') or '')[:120]
                    mtype = 'Movie' if r.get('media_type') == 'movie' else 'TV Show'
                    summaries.append(f"- {title} ({year}) [{mtype}]: {overview}")
                tmdb_context = "Relevant titles from TMDB (use this real data in your response):\n" + "\n".join(summaries)
            except Exception as e:
                logger.warning(f"TMDB RAG fetch failed: {e}")

        # ---- 2. Build system prompt ----
        from datetime import datetime
        now_str = datetime.now().strftime('%A, %d %B %Y, %I:%M %p')
        
        system_prompt = (
            f"You are CineMind, a smart cinema AI assistant for SmartCinema.\n"
            f"Current Date and Time: {now_str}\n\n"
            f"CRITICAL RULES:\n"
            f"1. IF the user asks a general question (e.g. current time, date, math, greetings), answer ONLY that question directly and naturally. DO NOT mention or recommend any movies whatsoever.\n"
            f"2. ONLY recommend movies or TV shows if the user explicitly asks for them.\n"
            f"3. Do not invent details. Be concise, warm, and speak the user's language.\n"
            f"4. When recommending titles, include the English original title in parentheses."
        )
        if tmdb_context:
            system_prompt += f"\n\n{tmdb_context}"

        # ---- 3. Call Ollama with history ----
        messages = [{"role": "system", "content": system_prompt}]
        for turn in history[-10:]:  # Keep last 10 turns for context window
            messages.append({"role": turn.get('role', 'user'), "content": turn.get('content', '')})
        messages.append({"role": "user", "content": message})

        if not self.ollama_available:
            raise Exception("Ollama is not running. Please start Ollama first (`ollama serve`).")

        url = "http://localhost:11434/v1/chat/completions"
        payload = {
            "model": self.OLLAMA_MODEL,
            "messages": messages,
            "temperature": 0.7,
            "stream": False
        }
        res = requests.post(url, json=payload, timeout=120)
        res.raise_for_status()
        response_text = res.json()['choices'][0]['message']['content']

        # ---- 4. Build media cards from TMDB results referenced in the response ----
        media_cards = self._build_media_cards(response_text, tmdb_results)

        return {'text': response_text, 'media_cards': media_cards}

    def _build_media_cards(self, ai_text: str, tmdb_results: list) -> list:
        """Match mentioned titles in AI response to TMDB results and enrich with library data."""
        if not tmdb_results:
            return []
        from database import get_all_media
        from metadata import TMDB_IMAGE_BASE
        
        # Get all local media titles for matching
        try:
            local_media = get_all_media(limit=9999)
            local_by_tmdb_id = {str(m.get('tmdb_id')): m for m in local_media if m.get('tmdb_id')}
            local_by_title = {m.get('title', '').lower(): m for m in local_media}
        except Exception:
            local_by_tmdb_id = {}
            local_by_title = {}

        cards = []
        for item in tmdb_results:
            title = item.get('title') or item.get('name', '')
            if not title:
                continue
            # Only include if title is mentioned in the AI response (loose match)
            if title.lower() not in ai_text.lower() and title not in ai_text:
                # Try partial match on first 5 chars
                if not any(title[:5].lower() in ai_text.lower() for t in [title] if len(t) >= 5):
                    continue

            poster_path = item.get('poster_path')
            poster_url = f"{TMDB_IMAGE_BASE}/w342{poster_path}" if poster_path else None
            tmdb_id = str(item.get('id', ''))
            media_type = item.get('media_type', 'movie')
            year = (item.get('release_date') or item.get('first_air_date') or '')[:4]
            
            # Check if in user's library
            local_match = local_by_tmdb_id.get(tmdb_id) or local_by_title.get(title.lower())
            local_id = local_match.get('id') if local_match else None

            cards.append({
                'title': title,
                'year': year,
                'poster_url': poster_url,
                'tmdb_id': item.get('id'),
                'media_type': media_type,
                'local_id': local_id,  # None if not in library
                'tmdb_url': f"https://www.themoviedb.org/{media_type}/{item.get('id')}"
            })
        
        return cards[:8]  # Max 8 cards per response

    def generate_dynamic_playlist(self, user_prompt: str):
        """
        Generate a dynamic playlist using AI based on user prompt.
        """
        from database import get_connection
        # Fetch all available media
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, title, genres, year, overview, type FROM media")
            media_list = [dict(row) for row in cursor.fetchall()]
            
        # Simplify media list for the prompt to save tokens
        simplified_media = []
        for m in media_list:
            simplified_media.append({
                'id': m['id'],
                'title': m['title'],
                'genres': m.get('genres', ''),
                'year': m.get('year', ''),
                'type': m.get('type', 'movie')
            })
            
        import json
        media_json = json.dumps(simplified_media, ensure_ascii=False)
        
        prompt = f"""أنت مساعد سينمائي ذكي. بناءً على طلب المستخدم: '{user_prompt}'
        اختر من قائمة الأفلام والمسلسلات المتاحة في المكتبة أدناه القائمة المناسبة.
        قائمة المكتبة المتاحة: {media_json}
        قم بإرجاع JSON بالصيغة التالية فقط:
        {{ "name": "اسم القائمة المقترح باللغة العربية", "description": "وصف القائمة", "media_ids": [قائمة معرفات الأفلام المختارة] }}"""
        
        prompt_hash = self._hash_prompt("playlist_" + prompt)
        
        # Check Cache
        cached = self._get_from_cache(prompt_hash)
        if cached:
            try:
                return json.loads(cached)
            except json.JSONDecodeError:
                pass
                
        # Try Ollama first
        if self.ollama_available:
            try:
                response_text, tokens_used = self._call_ollama(None, prompt)
                text = response_text.replace('```json', '').replace('```', '').strip()
                start = text.find('{')
                end = text.rfind('}') + 1
                if start != -1 and end != -1:
                    text = text[start:end]
                parsed_data = json.loads(text)
                self._save_to_cache(prompt_hash, json.dumps(parsed_data), 'ollama', tokens_used)
                return parsed_data
            except Exception as e:
                logger.warning(f"Ollama playlist generation failed, trying online: {e}")

        # Try online keys
        keys = self._get_active_keys()
        for key_data in keys:
            provider_name = key_data['provider']
            try:
                response_text, tokens_used = self.providers[provider_name](key_data['api_key'], prompt)
                self._update_usage(key_data['id'], tokens_used)
                
                text = response_text.replace('```json', '').replace('```', '').strip()
                start = text.find('{')
                end = text.rfind('}') + 1
                self._save_to_cache(prompt_hash, json.dumps(parsed_data), provider_name, tokens_used)
                return parsed_data
            except Exception as e:
                logger.error(f"AI Playlist Error ({provider_name}): {e}")
                self._log_error(key_data['id'])
                continue

        # Fallback if no AI keys/Ollama configured
        matching_ids = [m['id'] for m in simplified_media[:5]]
        return {
            "name": f"قائمة {user_prompt[:20]}",
            "description": f"قائمة مقترحة بناءً على: {user_prompt}",
            "media_ids": matching_ids
        }

    def generate_catchup_summary(self, series_title: str, season_num: int, episode_num: int):
        """Generate a spoiler-free catchup summary for TV episodes"""
        prompt = f"""أنت مساعد سينمائي خبير ومحترف.
قم بتلخيص الأحداث الرئيسية السابقة لمسلسل '{series_title}' حتى الموسم {season_num} الحلقة {episode_num} باللغة العربية الفصحى وبأسلوب مشوق ومختصر (في 3 فقرات قصيرة).
تحذير حاسم: يُمنع منعاً باتاً ذكر أو حرق أي أحداث تقع بعد الموسم {season_num} الحلقة {episode_num}."""

        prompt_hash = self._hash_prompt(f"catchup_{series_title}_s{season_num}e{episode_num}")
        
        cached = self._get_from_cache(prompt_hash)
        if cached:
            return {'summary': cached, 'series_title': series_title, 'up_to': f'S{season_num}E{episode_num}'}

        if self.ollama_available:
            try:
                response_text, tokens_used = self._call_ollama(None, prompt)
                self._save_to_cache(prompt_hash, response_text, 'ollama', tokens_used)
                return {'summary': response_text, 'series_title': series_title, 'up_to': f'S{season_num}E{episode_num}'}
            except Exception as e:
                logger.warning(f"Ollama catchup failed: {e}")

        keys = self._get_active_keys()
        for key_data in keys:
            provider_name = key_data['provider']
            try:
                response_text, tokens_used = self.providers[provider_name](key_data['api_key'], prompt)
                self._update_usage(key_data['id'], tokens_used)
                self._save_to_cache(prompt_hash, response_text, provider_name, tokens_used)
                return {'summary': response_text, 'series_title': series_title, 'up_to': f'S{season_num}E{episode_num}'}
            except Exception as e:
                logger.error(f"AI Catchup Error ({provider_name}): {e}")
                self._log_error(key_data['id'])
                continue

        # Friendly fallback if no AI key configured
        fallback_summary = f"تتبع الأحداث السابقة لمسلسل {series_title} الصراعات والتطورات المشوقة للشخصيات الرئيسية حتى الموسم {season_num} الحلقة {episode_num}. للمزيد من التلخيص التفصيلي بالذكاء الاصطناعي، يرجى إضافة مفتاح AI (Gemini/Groq/OpenAI) من صفحة الإعدادات أو تفعيل Ollama محلياً."
        return {'summary': fallback_summary, 'series_title': series_title, 'up_to': f'S{season_num}E{episode_num}'}

# Singleton
ai_service = AIService()

