from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactRequestCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    reason: str = Field(min_length=1, max_length=300)
    message: str = Field(min_length=1, max_length=5000)
    # Honeypot: legitimate clients never fill this in. Left empty by the form
    # and hidden from view, so a non-empty value marks the submission as spam.
    website: str = Field(default='', max_length=200)


class ContactRequestResponse(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)
