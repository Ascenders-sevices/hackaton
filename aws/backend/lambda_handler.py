import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "airbee.settings")

import django
django.setup()

from mangum import Mangum
from airbee.asgi import application

handler = Mangum(application, lifespan="off")
