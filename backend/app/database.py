import os
from supabase import create_client, Client

SUPABASE_URL = "https://yrdjnkbrvynmnzyrxlfx.supabase.co"
SUPABASE_KEY = "sb_publishable_X4iaZ7islKo9js4bvdpl3w_T_Ka3dVD"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)